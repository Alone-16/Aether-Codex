#!/usr/bin/env python3
"""
Aether Codex — ani-cli Local Bridge
Standalone HTTP bridge for launching ani-cli from the Aether Codex web interface.
Requires Python 3.8+ and no third-party packages.
"""

import argparse
import datetime
import hmac
import http.server
import json
import os
import re
import shlex
import shutil
import socketserver
import subprocess
import sys
import tempfile
import threading
import time
import traceback

# Guard against pythonw.exe on Windows where sys.stdout and sys.stderr are None
if sys.stdout is None or sys.stderr is None:
    try:
        if sys.platform == "win32":
            _base = os.environ.get("APPDATA") or os.path.expanduser("~")
        else:
            _base = os.environ.get("XDG_CONFIG_HOME") or os.path.expanduser("~/.config")
        _log_dir = os.path.join(_base, "aether-bridge")
        os.makedirs(_log_dir, exist_ok=True)
        _log_file = open(os.path.join(_log_dir, "bridge.log"), "a", encoding="utf-8")
        if sys.stdout is None:
            sys.stdout = _log_file
        if sys.stderr is None:
            sys.stderr = _log_file
    except Exception:
        if sys.stdout is None:
            sys.stdout = open(os.devnull, "w", encoding="utf-8")
        if sys.stderr is None:
            sys.stderr = open(os.devnull, "w", encoding="utf-8")

BRIDGE_VERSION = "1.0.0"

# ── Baked Template Defaults ──────────────────────────────────────────
# These placeholders are substituted by the browser at download time.
BAKED_TOKEN = "ac_bridge_test_token_v6e9mq741db"
ALLOWED_ORIGIN = "https://aethercodex.pages.dev"
CONFIGURED_PORT = 47619
try:
    DEFAULT_SETTINGS = json.loads(r'''{"player":"mpv","quality":"best","audio":"sub","autoSelect":true}''')
except Exception:
    DEFAULT_SETTINGS = {}

ALLOWED_PLAYERS = {"mpv", "vlc"}
ALLOWED_QUALITIES = {"auto", "best", "1080", "720", "480", "360", "worst"}
ALLOWED_AUDIOS = {"sub", "dub"}


# ── Configuration Management ─────────────────────────────────────────
def get_config_dir():
    if sys.platform == "win32":
        base = os.environ.get("APPDATA") or os.path.expanduser("~")
        return os.path.join(base, "aether-bridge")
    else:
        base = os.environ.get("XDG_CONFIG_HOME") or os.path.expanduser("~/.config")
        return os.path.join(base, "aether-bridge")


def get_config_file_path():
    return os.path.join(get_config_dir(), "config.json")


def load_or_create_config():
    cfg_path = get_config_file_path()
    cfg_dir = os.path.dirname(cfg_path)
    try:
        os.makedirs(cfg_dir, exist_ok=True)
    except Exception as e:
        sys.stderr.write(f"[WARN] Failed to create config directory {cfg_dir}: {e}\n")

    initial_config = {
        "ani_cli_path": "",
        "terminal_command": "",
        "default_settings": DEFAULT_SETTINGS if isinstance(DEFAULT_SETTINGS, dict) else {},
        "token": "",
    }

    if not os.path.isfile(cfg_path):
        try:
            with open(cfg_path, "w", encoding="utf-8") as f:
                json.dump(initial_config, f, indent=2)
        except Exception as e:
            sys.stderr.write(f"[WARN] Failed to write initial config: {e}\n")
        return initial_config

    try:
        with open(cfg_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, dict):
                return {**initial_config, **data}
    except Exception as e:
        sys.stderr.write(f"[WARN] Failed to read config file {cfg_path}: {e}\n")

    return initial_config


def save_config(config):
    cfg_path = get_config_file_path()
    try:
        with open(cfg_path, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=2)
    except Exception as e:
        sys.stderr.write(f"[WARN] Failed to save config {cfg_path}: {e}\n")


# ── Rate Limiter & Debounce ──────────────────────────────────────────
class RateLimiter:
    """
    Enforces:
    - 2-second launch debounce
    - Maximum 5 launches per rolling 60 seconds
    - At most one launch process active at a time
    """
    def __init__(self):
        self.lock = threading.Lock()
        self.launch_history = []
        self.last_launch_time = 0.0
        self.is_launching = False

    def check_and_reserve(self):
        with self.lock:
            now = time.time()
            if self.is_launching:
                return False, "Launch already in progress", 409
            if now - self.last_launch_time < 2.0:
                remaining = round(2.0 - (now - self.last_launch_time), 2)
                return False, f"Debounce active. Please wait {remaining}s before next launch", 429

            # Prune launches older than 60 seconds
            self.launch_history = [t for t in self.launch_history if now - t < 60.0]
            if len(self.launch_history) >= 5:
                return False, "Rate limit exceeded: maximum 5 launches per minute", 429

            self.is_launching = True
            self.last_launch_time = now
            self.launch_history.append(now)
            return True, None, 200

    def release_launch(self):
        with self.lock:
            self.is_launching = False


# ── Capabilities Detection ───────────────────────────────────────────
def detect_capabilities(config=None):
    cfg = config or {}
    ani_path = cfg.get("ani_cli_path") or ""

    if not ani_path or not os.path.isfile(ani_path):
        ani_path = shutil.which("ani-cli") or shutil.which("ani-cli.cmd") or ""

    if not ani_path and sys.platform == "win32":
        # Check standard Scoop / Tools paths on Windows
        candidates = [
            r"C:\Tools\bin\ani-cli.cmd",
            os.path.expanduser(r"~\scoop\shims\ani-cli.cmd"),
            os.path.expanduser(r"~\scoop\apps\ani-cli\current\ani-cli"),
        ]
        for c in candidates:
            if os.path.isfile(c):
                ani_path = c
                break

    version_str = None
    flags = {
        "vlc": False,
        "quality": False,
        "dub": False,
        "select_nth": False,
        "episode": False,
    }

    if ani_path:
        try:
            ver_proc = subprocess.run(
                [ani_path, "-V"],
                capture_output=True,
                text=True,
                timeout=5,
                check=False
            )
            v = ver_proc.stdout.strip() or ver_proc.stderr.strip()
            if v:
                version_str = v.splitlines()[0].strip()
        except Exception:
            pass

        try:
            help_proc = subprocess.run(
                [ani_path, "--help"],
                capture_output=True,
                text=True,
                timeout=5,
                check=False
            )
            help_text = (help_proc.stdout + " " + help_proc.stderr)
            flags["vlc"] = bool("-v" in help_text or "--vlc" in help_text)
            flags["quality"] = bool("-q" in help_text or "--quality" in help_text)
            flags["dub"] = bool("--dub" in help_text)
            flags["select_nth"] = bool("-S" in help_text or "--select-nth" in help_text)
            flags["episode"] = bool("-e" in help_text or "--episode" in help_text)
        except Exception:
            pass

    players = {
        "mpv": bool(shutil.which("mpv") or shutil.which("mpv.com") or shutil.which("mpv.exe")),
        "vlc": bool(shutil.which("vlc") or shutil.which("vlc.exe")),
    }

    # Detect available terminal
    term_detected = None
    term_available = False
    custom_term = cfg.get("terminal_command")

    if custom_term:
        term_detected = "custom"
        term_available = True
    elif sys.platform.startswith("linux"):
        for t in ["kitty", "alacritty", "foot", "wezterm", "gnome-terminal", "konsole", "xterm"]:
            if shutil.which(t):
                term_detected = t
                term_available = True
                break
    elif sys.platform == "win32":
        if shutil.which("wt") or shutil.which("wt.exe"):
            term_detected = "wt"
            term_available = True
        elif os.path.isfile(r"C:\Program Files\Git\bin\bash.exe") or shutil.which("bash"):
            term_detected = "git-bash"
            term_available = True
        elif shutil.which("wsl") or shutil.which("wsl.exe"):
            term_detected = "wsl"
            term_available = True
        elif shutil.which("cmd") or shutil.which("cmd.exe"):
            term_detected = "cmd"
            term_available = True
    elif sys.platform == "darwin":
        term_detected = "Terminal.app"
        term_available = True

    return {
        "ok": True,
        "version": BRIDGE_VERSION,
        "ani_cli": {
            "path": ani_path or None,
            "version": version_str,
            "available": bool(ani_path),
            "flags": flags,
        },
        "players": players,
        "terminal": {
            "detected": term_detected,
            "available": term_available,
        },
    }


# ── Terminal Launch Execution ────────────────────────────────────────
def launch_in_terminal(argv, capabilities, config):
    term_info = capabilities.get("terminal", {})
    term_name = term_info.get("detected")
    custom_cmd = config.get("terminal_command")

    if custom_cmd:
        if isinstance(custom_cmd, list):
            cmd = []
            for item in custom_cmd:
                if "{cmd}" in item:
                    cmd.extend(argv)
                else:
                    cmd.append(item)
            subprocess.Popen(cmd, env=os.environ.copy())
            return
        elif isinstance(custom_cmd, str):
            quoted = " ".join(shlex.quote(a) for a in argv)
            final_str = custom_cmd.replace("{cmd}", quoted)
            # Never execute with shell=True; parse arguments safely
            parsed_cmd = shlex.split(final_str, posix=(sys.platform != "win32"))
            subprocess.Popen(parsed_cmd, env=os.environ.copy())
            return

    if sys.platform.startswith("linux"):
        env = os.environ.copy()
        term = term_name or "xterm"
        if term == "kitty":
            cmd = ["kitty", "--hold"] + argv
        elif term == "alacritty":
            cmd = ["alacritty", "--hold", "-e"] + argv
        elif term == "foot":
            cmd = ["foot", "--hold"] + argv
        elif term == "wezterm":
            cmd = ["wezterm", "start", "--"] + argv
        elif term == "gnome-terminal":
            cmd = ["gnome-terminal", "--"] + argv
        elif term == "konsole":
            cmd = ["konsole", "--noclose", "-e"] + argv
        else:
            cmd = ["xterm", "-hold", "-e"] + argv

        subprocess.Popen(cmd, env=env, start_new_session=True)

    elif sys.platform == "win32":
        creationflags = getattr(subprocess, "CREATE_NEW_CONSOLE", 0x00000010)
        is_batch = argv[0].lower().endswith((".cmd", ".bat"))
        git_bash = None
        if os.path.isfile(r"C:\Program Files\Git\bin\bash.exe"):
            git_bash = r"C:\Program Files\Git\bin\bash.exe"
        else:
            git_bash = shutil.which("bash")

        # Use cmd.exe /c start to guarantee a new interactive window is created and brought to the FOREGROUND
        if is_batch:
            cmd = ["cmd.exe", "/c", "start", "ani-cli", "cmd.exe", "/k", "call"] + argv
        elif git_bash:
            clean_args = [a.replace("\\", "/") for a in argv]
            quoted = " ".join(shlex.quote(a) for a in clean_args)
            bash_script = f"{quoted}; echo; read -p 'Press Enter to exit...'"
            cmd = ["cmd.exe", "/c", "start", "ani-cli", git_bash, "-c", bash_script]
        elif shutil.which("wsl") or shutil.which("wsl.exe"):
            wsl_bin = shutil.which("wsl") or shutil.which("wsl.exe")
            cmd = ["cmd.exe", "/c", "start", "ani-cli", wsl_bin, "-e"] + argv
        else:
            cmd = ["cmd.exe", "/c", "start", "ani-cli", "cmd.exe", "/k", "call"] + argv

        subprocess.Popen(cmd, env=os.environ.copy(), creationflags=creationflags)

    elif sys.platform == "darwin":
        quoted = " ".join(shlex.quote(a) for a in argv)
        script_fd, script_path = tempfile.mkstemp(suffix=".sh", prefix="aether_launcher_")
        with os.fdopen(script_fd, "w", encoding="utf-8") as f:
            f.write("#!/bin/bash\n")
            f.write(f"trap 'rm -f \"{script_path}\"' EXIT\n")
            f.write(f"{quoted}\n")
            f.write("echo 'Finished. Press Enter to close window.'\n")
            f.write("read -r\n")
        os.chmod(script_path, 0o700)
        subprocess.Popen(["open", "-a", "Terminal", script_path], env=os.environ.copy())

    else:
        raise RuntimeError(f"Unsupported operating system for terminal launch: {sys.platform}")


# ── HTTP Handler ─────────────────────────────────────────────────────
class AetherBridgeHandler(http.server.BaseHTTPRequestHandler):
    server_version = f"AetherBridge/{BRIDGE_VERSION}"

    def log_message(self, format, *args):
        # Suppress default noisy access logs to stderr
        pass

    def send_json(self, data, status=200, origin=None):
        raw = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_cors_headers(origin)
        self.end_headers()
        self.wfile.write(raw)

    def send_cors_headers(self, origin):
        valid_origin = self.get_validated_origin(origin)
        if valid_origin:
            self.send_header("Access-Control-Allow-Origin", valid_origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        req_headers = self.headers.get("Access-Control-Request-Headers")
        if req_headers:
            self.send_header("Access-Control-Allow-Headers", req_headers)
        else:
            self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Aether-Token, *")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Access-Control-Max-Age", "86400")

    def get_validated_origin(self, origin=None):
        req_origin = origin or self.headers.get("Origin")
        if not req_origin:
            return None
        allowed_exact = getattr(self.server, "allowed_origin", "")
        if req_origin == allowed_exact:
            return req_origin

        # Check Cloudflare Workers & Pages deployments
        cloud_regex = re.compile(r"^https://[a-zA-Z0-9.-]+\.(workers\.dev|pages\.dev)$")
        if cloud_regex.match(req_origin):
            return req_origin

        # Check local dev origins
        dev_regex = re.compile(r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$")
        if dev_regex.match(req_origin):
            return req_origin

        return None

    def validate_request_security(self, require_token=True):
        # 1. Validate Host header
        host = (self.headers.get("Host") or "").lower().strip()
        port = str(getattr(self.server, "port", CONFIGURED_PORT))
        valid_hosts = {
            f"127.0.0.1:{port}",
            f"localhost:{port}",
            "127.0.0.1",
            "localhost",
        }
        if host not in valid_hosts:
            self.send_json({"ok": False, "error": "Forbidden: invalid Host header"}, status=403)
            return False

        # 2. Validate Origin header if present
        origin = self.headers.get("Origin")
        if origin:
            if not self.get_validated_origin(origin):
                self.send_json({"ok": False, "error": "Forbidden: untrusted Origin"}, status=403)
                return False

        # 3. Validate Token
        if require_token:
            auth_token = getattr(self.server, "auth_token", "")
            saved_token = self.server.config.get("token") or ""
            token_header = self.headers.get("X-Aether-Token") or ""

            # Check if token matches server auth_token, saved_token, or baked_token
            is_valid = False
            for valid_candidate in (auth_token, saved_token, BAKED_TOKEN):
                if valid_candidate and token_header and hmac.compare_digest(token_header.encode("utf-8"), valid_candidate.encode("utf-8")):
                    is_valid = True
                    break

            # If no custom token is saved yet and request is from a verified trusted origin, auto-pair with browser token
            if not is_valid and not saved_token and token_header.startswith("ac_bridge_"):
                self.server.config["token"] = token_header
                save_config(self.server.config)
                self.server.auth_token = token_header
                is_valid = True
                sys.stdout.write(f"[OK] Paired with browser token: {token_header[:12]}...\n")
                sys.stdout.flush()

            if not is_valid:
                self.send_json({"ok": False, "error": "Unauthorized: invalid or missing authentication token"}, status=401)
                return False

        return True

    def do_OPTIONS(self):
        try:
            # Validate Host & Origin for preflight
            if not self.validate_request_security(require_token=False):
                return

            origin = self.headers.get("Origin")
            self.send_response(204)
            self.send_cors_headers(origin)
            self.send_header("Content-Length", "0")
            self.end_headers()
        except Exception as e:
            sys.stderr.write(f"Error handling OPTIONS: {e}\n")

    def do_GET(self):
        try:
            path = self.path.split("?")[0].rstrip("/")
            if path == "/ping":
                if not self.validate_request_security(require_token=True):
                    return
                self.send_json({"ok": True, "version": BRIDGE_VERSION, "os": sys.platform})
            elif path == "/capabilities":
                if not self.validate_request_security(require_token=True):
                    return
                caps = detect_capabilities(self.server.config)
                self.send_json(caps)
            else:
                self.send_json({"ok": False, "error": "Not found"}, status=404)
        except Exception as e:
            sys.stderr.write(f"Error handling GET: {e}\n")
            try:
                self.send_json({"ok": False, "error": f"Internal server error: {e}"}, status=500)
            except Exception:
                pass

    def do_POST(self):
        try:
            self._handle_post_play()
        except Exception as e:
            sys.stderr.write(f"Error handling POST: {e}\n")
            try:
                self.send_json({"ok": False, "error": f"Internal server error: {e}"}, status=500)
            except Exception:
                pass

    def _handle_post_play(self):
        path = self.path.split("?")[0].rstrip("/")
        if path != "/play":
            self.send_json({"ok": False, "error": "Not found"}, status=404)
            return

        if not self.validate_request_security(require_token=True):
            return

        # Request body limit: 4 KB
        content_length_header = self.headers.get("Content-Length")
        if not content_length_header:
            self.send_json({"ok": False, "error": "Missing Content-Length header"}, status=400)
            return

        try:
            length = int(content_length_header)
        except ValueError:
            self.send_json({"ok": False, "error": "Invalid Content-Length header"}, status=400)
            return

        if length > 4096:
            # Drain body to avoid Windows connection reset (RST)
            try:
                self.rfile.read(min(length, 65536))
            except Exception:
                pass
            self.close_connection = True
            self.send_json({"ok": False, "error": "Payload Too Large: body exceeds 4KB"}, status=413)
            return

        try:
            body_bytes = self.rfile.read(length)
        except Exception as e:
            self.send_json({"ok": False, "error": f"Failed to read request body: {e}"}, status=400)
            return

        if len(body_bytes) > 4096:
            self.close_connection = True
            self.send_json({"ok": False, "error": "Payload Too Large: body exceeds 4KB"}, status=413)
            return

        try:
            payload = json.loads(body_bytes.decode("utf-8"))
        except Exception:
            self.send_json({"ok": False, "error": "Malformed JSON payload"}, status=400)
            return

        if not isinstance(payload, dict):
            self.send_json({"ok": False, "error": "Payload must be a JSON object"}, status=400)
            return

        # Check allowed top-level keys
        allowed_top_keys = {"title", "episode", "settings"}
        extra_keys = set(payload.keys()) - allowed_top_keys
        if extra_keys:
            self.send_json({"ok": False, "error": f"Unexpected fields in request: {list(extra_keys)}"}, status=400)
            return

        # Title validation
        raw_title = payload.get("title")
        if not isinstance(raw_title, str):
            self.send_json({"ok": False, "error": "Field 'title' is required and must be a string"}, status=400)
            return

        title = raw_title.strip()
        if not title:
            self.send_json({"ok": False, "error": "Title cannot be empty or whitespace"}, status=400)
            return

        if len(title) > 200:
            self.send_json({"ok": False, "error": "Title exceeds 200 characters limit"}, status=400)
            return

        if title.startswith("-"):
            self.send_json({"ok": False, "error": "Title cannot start with a hyphen"}, status=400)
            return

        if "\0" in title:
            self.send_json({"ok": False, "error": "Title cannot contain NUL byte"}, status=400)
            return

        if any(ord(c) < 32 or ord(c) == 127 for c in title):
            self.send_json({"ok": False, "error": "Title cannot contain control characters or newlines"}, status=400)
            return

        # Episode validation
        episode = payload.get("episode")
        if episode is not None:
            if not isinstance(episode, int) or isinstance(episode, bool):
                self.send_json({"ok": False, "error": "Episode must be an integer between 1 and 9999"}, status=400)
                return
            if episode < 1 or episode > 9999:
                self.send_json({"ok": False, "error": "Episode must be between 1 and 9999"}, status=400)
                return

        # Settings validation
        settings = payload.get("settings") or {}
        if not isinstance(settings, dict):
            self.send_json({"ok": False, "error": "Settings must be a JSON object"}, status=400)
            return

        allowed_settings_keys = {"player", "quality", "audio", "autoSelect"}
        extra_settings = set(settings.keys()) - allowed_settings_keys
        if extra_settings:
            self.send_json({"ok": False, "error": f"Unknown setting fields: {list(extra_settings)}"}, status=400)
            return

        player = settings.get("player", "mpv")
        if player not in ALLOWED_PLAYERS:
            self.send_json({"ok": False, "error": f"Unsupported player '{player}'. Allowed: {list(ALLOWED_PLAYERS)}"}, status=400)
            return

        quality = settings.get("quality", "auto")
        if quality not in ALLOWED_QUALITIES:
            self.send_json({"ok": False, "error": f"Unsupported quality '{quality}'. Allowed: {list(ALLOWED_QUALITIES)}"}, status=400)
            return

        audio = settings.get("audio", "sub")
        if audio not in ALLOWED_AUDIOS:
            self.send_json({"ok": False, "error": f"Unsupported audio '{audio}'. Allowed: {list(ALLOWED_AUDIOS)}"}, status=400)
            return

        auto_select = settings.get("autoSelect", True)
        if not isinstance(auto_select, bool):
            self.send_json({"ok": False, "error": "Setting 'autoSelect' must be a boolean"}, status=400)
            return

        # Rate limit and debounce check
        allowed, err_msg, status_code = self.server.rate_limiter.check_and_reserve()
        if not allowed:
            self.send_json({"ok": False, "error": err_msg}, status=status_code)
            return

        try:
            # Capability check & command construction
            caps = detect_capabilities(self.server.config)
            ani_info = caps.get("ani_cli", {})
            ani_path = ani_info.get("path")
            flags = ani_info.get("flags", {})

            if not ani_info.get("available") or not ani_path:
                self.send_json({"ok": False, "error": "ani-cli executable not found on host"}, status=500)
                return

            if player == "vlc":
                if not flags.get("vlc"):
                    self.send_json({"ok": False, "error": "VLC flag is not supported by installed ani-cli"}, status=400)
                    return
                if not caps.get("players", {}).get("vlc"):
                    self.send_json({"ok": False, "error": "VLC executable is not installed or not in PATH"}, status=400)
                    return

            if audio == "dub" and not flags.get("dub"):
                self.send_json({"ok": False, "error": "--dub flag is not supported by installed ani-cli"}, status=400)
                return

            if episode is not None and not flags.get("episode"):
                self.send_json({"ok": False, "error": "-e/--episode flag is not supported by installed ani-cli"}, status=400)
                return

            # Construct argv
            argv = [ani_path]

            if player == "vlc":
                argv.append("-v")

            if quality != "auto" and flags.get("quality"):
                argv.extend(["-q", str(quality)])

            if audio == "dub":
                argv.append("--dub")

            if auto_select and flags.get("select_nth"):
                argv.extend(["-S", "1"])

            if episode is not None:
                argv.extend(["-e", str(episode)])

            # Title must be final argument
            argv.append(title)

            # Log one concise line per request (safely encode UTF-8 for any terminal/codepage)
            now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            origin = self.headers.get("Origin") or "direct"
            log_line = f"[{now_str}] origin={origin} title={title} argv={argv}\n"
            try:
                sys.stdout.buffer.write(log_line.encode("utf-8", errors="replace"))
                sys.stdout.buffer.flush()
            except Exception:
                sys.stdout.write(log_line.encode("ascii", errors="replace").decode("ascii"))
                sys.stdout.flush()

            if getattr(self.server, "dry_run", False):
                self.send_json({"ok": True, "argv": argv, "dry_run": True})
                return

            # Launch terminal
            term_avail = caps.get("terminal", {}).get("available")
            if not term_avail:
                self.send_json({"ok": False, "error": "No supported terminal found to launch ani-cli"}, status=500)
                return

            try:
                launch_in_terminal(argv, caps, self.server.config)
            except Exception as e:
                self.send_json({"ok": False, "error": f"Failed to launch terminal: {e}"}, status=500)
                return

            self.send_json({"ok": True, "argv": argv})

        finally:
            self.server.rate_limiter.release_launch()


# ── Server Setup ─────────────────────────────────────────────────────
class ThreadingHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def run_bridge_server(token, origin, port, dry_run=False):
    config = load_or_create_config()
    server = ThreadingHTTPServer(("127.0.0.1", port), AetherBridgeHandler)
    server.auth_token = token
    server.allowed_origin = origin
    server.port = port
    server.dry_run = dry_run
    server.config = config
    server.rate_limiter = RateLimiter()

    mode_str = " (DRY-RUN)" if dry_run else ""
    sys.stdout.write(f"Starting Aether Bridge v{BRIDGE_VERSION}{mode_str} on http://127.0.0.1:{port}\n")
    sys.stdout.write(f"Allowed Origin: {origin}\n")
    sys.stdout.flush()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        sys.stdout.write("\nShutting down bridge server...\n")
    except Exception as e:
        sys.stderr.write(f"\n[ERROR] Server error: {e}\n{traceback.format_exc()}\n")
        sys.stderr.flush()
    finally:
        server.server_close()


# ── Autostart Management ─────────────────────────────────────────────
def install_autostart():
    script_path = os.path.abspath(__file__)
    if sys.platform == "win32":
        py_dir = os.path.dirname(sys.executable)
        pythonw = os.path.join(py_dir, "pythonw.exe")
        if not os.path.isfile(pythonw):
            pythonw = shutil.which("pythonw") or sys.executable

        startup_dir = os.path.join(os.environ.get("APPDATA", ""), r"Microsoft\Windows\Start Menu\Programs\Startup")
        if not os.path.isdir(startup_dir):
            sys.stderr.write(f"Startup directory not found: {startup_dir}\n")
            return 1

        script_dir = os.path.dirname(script_path)
        vbs_path = os.path.join(startup_dir, "aether-bridge.vbs")
        # Run pythonw with hidden window (0) and do not wait for exit (False)
        vbs_content = (
            'Set WshShell = CreateObject("WScript.Shell")\r\n'
            f'WshShell.CurrentDirectory = "{script_dir}"\r\n'
            f'WshShell.Run """{pythonw}"" ""{script_path}""", 0, False\r\n'
        )
        try:
            with open(vbs_path, "w", encoding="utf-8") as f:
                f.write(vbs_content)
        except Exception as e:
            sys.stderr.write(f"Failed to write startup launcher: {e}\n")
            return 1

        sys.stdout.write("[OK] Autostart installed successfully on Windows!\n")
        sys.stdout.write(f"  Startup Launcher: {vbs_path}\n")
        sys.stdout.write(f"  Target Script:    {script_path}\n")
        sys.stdout.write(f"  Interpreter:      {pythonw} (Silent background execution)\n\n")
        sys.stdout.write("The bridge will now start automatically in the background whenever you log in.\n")
        sys.stdout.write("To remove autostart later, run: python aether-bridge.py --uninstall-autostart\n")
        return 0

    elif sys.platform.startswith("linux"):
        systemd_user_dir = os.path.expanduser("~/.config/systemd/user")
        os.makedirs(systemd_user_dir, exist_ok=True)
        service_path = os.path.join(systemd_user_dir, "aether-bridge.service")
        service_content = f"""[Unit]
Description=Aether Codex ani-cli Local Bridge
After=network.target

[Service]
Type=simple
ExecStart={sys.executable} {script_path}
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
"""
        try:
            with open(service_path, "w", encoding="utf-8") as f:
                f.write(service_content)
        except Exception as e:
            sys.stderr.write(f"Failed to write systemd service file: {e}\n")
            return 1

        subprocess.run(["systemctl", "--user", "daemon-reload"], check=False)
        res = subprocess.run(["systemctl", "--user", "enable", "--now", "aether-bridge.service"], check=False)
        if res.returncode == 0:
            sys.stdout.write("[OK] Autostart service installed and started via systemd user service!\n")
            sys.stdout.write(f"  Service file: {service_path}\n")
        else:
            sys.stdout.write(f"Service file written to {service_path}.\nRun 'systemctl --user enable --now aether-bridge.service' to activate.\n")
        return 0
    else:
        sys.stderr.write(f"Autostart installer is not supported on {sys.platform}.\n")
        return 1


def uninstall_autostart():
    if sys.platform == "win32":
        startup_dir = os.path.join(os.environ.get("APPDATA", ""), r"Microsoft\Windows\Start Menu\Programs\Startup")
        vbs_path = os.path.join(startup_dir, "aether-bridge.vbs")
        if os.path.isfile(vbs_path):
            try:
                os.remove(vbs_path)
                sys.stdout.write(f"[OK] Removed autostart launcher: {vbs_path}\n")
            except Exception as e:
                sys.stderr.write(f"Failed to remove {vbs_path}: {e}\n")
                return 1
        else:
            sys.stdout.write("Autostart launcher was not found in Windows Startup.\n")
        return 0

    elif sys.platform.startswith("linux"):
        subprocess.run(["systemctl", "--user", "disable", "--now", "aether-bridge.service"], check=False)
        service_path = os.path.expanduser("~/.config/systemd/user/aether-bridge.service")
        if os.path.isfile(service_path):
            try:
                os.remove(service_path)
                subprocess.run(["systemctl", "--user", "daemon-reload"], check=False)
                sys.stdout.write("[OK] Removed systemd user service.\n")
            except Exception as e:
                sys.stderr.write(f"Failed to remove service file: {e}\n")
                return 1
        else:
            sys.stdout.write("systemd service file was not found.\n")
        return 0
    else:
        sys.stderr.write(f"Autostart uninstaller is not supported on {sys.platform}.\n")
        return 1


# ── CLI Entrypoint ───────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="Aether Codex ani-cli Local Bridge")
    parser.add_argument("--dry-run", action="store_true", help="Report argv without launching terminal")
    parser.add_argument("--port", type=int, default=None, help=f"Listening port (default: {CONFIGURED_PORT})")
    parser.add_argument("--token", type=str, default=None, help="Authentication token override")
    parser.add_argument("--print-config", action="store_true", help="Display local configuration and exit")
    parser.add_argument("--install-autostart", action="store_true", help="Set up automatic startup on login (Windows/Linux)")
    parser.add_argument("--uninstall-autostart", action="store_true", help="Remove automatic startup configuration")
    parser.add_argument("--version", action="store_true", help="Print bridge version and exit")

    args = parser.parse_args()

    if args.version:
        sys.stdout.write(f"aether-bridge {BRIDGE_VERSION}\n")
        return

    if args.install_autostart:
        code = install_autostart()
        sys.exit(code)

    if args.uninstall_autostart:
        code = uninstall_autostart()
        sys.exit(code)

    if args.print_config:
        cfg = load_or_create_config()
        # Redact any sensitive tokens if present
        safe_cfg = {k: v for k, v in cfg.items() if "token" not in k.lower() and "secret" not in k.lower()}
        sys.stdout.write(json.dumps(safe_cfg, indent=2) + "\n")
        return

    port = args.port or (int(CONFIGURED_PORT) if isinstance(CONFIGURED_PORT, int) else 47619)
    token = args.token or BAKED_TOKEN
    origin = ALLOWED_ORIGIN

    run_bridge_server(token=token, origin=origin, port=port, dry_run=args.dry_run)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        sys.stderr.write(f"\n[FATAL] Unhandled fatal error: {e}\n{traceback.format_exc()}\n")
        sys.stderr.flush()
        sys.exit(1)
