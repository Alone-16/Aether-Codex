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
BAKED_TOKEN = "__BAKED_TOKEN__"
ALLOWED_ORIGIN = "__ALLOWED_ORIGIN__"
CONFIGURED_PORT = 47619  # __CONFIGURED_PORT__
try:
    DEFAULT_SETTINGS = json.loads(r'''__DEFAULT_SETTINGS_JSON__''')
except Exception:
    DEFAULT_SETTINGS = {}

ALLOWED_PLAYERS = {"mpv", "vlc"}
ALLOWED_QUALITIES = {"auto", "best", "1080", "720", "480", "360", "worst"}
ALLOWED_AUDIOS = {"sub", "dub"}


def ensure_windows_player_paths():
    """Ensure standard player install directories (VLC, MPV, Scoop, bin) are in PATH on Windows."""
    if sys.platform != "win32":
        return
    candidate_dirs = [
        r"C:\Program Files\VideoLAN\VLC",
        r"C:\Program Files (x86)\VideoLAN\VLC",
        os.path.expandvars(r"%LOCALAPPDATA%\Programs\VideoLAN\VLC"),
        os.path.expanduser(r"~\scoop\apps\vlc\current"),
        os.path.expanduser(r"~\scoop\apps\mpv\current"),
        os.path.expanduser(r"~\scoop\shims"),
        os.path.expanduser(r"~\bin"),
        r"C:\Tools\bin",
        r"C:\Program Files\Git\bin",
        r"C:\Program Files\Git\usr\bin",
        os.path.expandvars(r"%LOCALAPPDATA%\Programs\Git\bin"),
        os.path.expandvars(r"%LOCALAPPDATA%\Programs\Git\usr\bin"),
    ]
    current_path = os.environ.get("PATH", "")
    current_parts = [p.lower() for p in current_path.split(os.pathsep) if p]
    to_add = []
    for d in candidate_dirs:
        if os.path.isdir(d) and d.lower() not in current_parts:
            to_add.append(d)
    if to_add:
        os.environ["PATH"] = os.pathsep.join(to_add) + os.pathsep + current_path


ensure_windows_player_paths()


def find_git_bash():
    """Locate Git Bash / Bash interpreter on host system."""
    if sys.platform != "win32":
        return shutil.which("bash")

    candidates = [
        r"C:\Program Files\Git\bin\bash.exe",
        r"C:\Program Files\Git\usr\bin\bash.exe",
        r"C:\Program Files (x86)\Git\bin\bash.exe",
        r"C:\Program Files (x86)\Git\usr\bin\bash.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\Programs\Git\bin\bash.exe"),
        os.path.expandvars(r"%LOCALAPPDATA%\Programs\Git\usr\bin\bash.exe"),
        r"C:\msys64\usr\bin\bash.exe",
        shutil.which("bash.exe"),
        shutil.which("bash"),
    ]
    for c in candidates:
        if c and os.path.isfile(c):
            return os.path.abspath(c)

    # Check Windows Registry for Git install location
    try:
        import winreg
        for root in (winreg.HKEY_LOCAL_MACHINE, winreg.HKEY_CURRENT_USER):
            for subkey in (r"SOFTWARE\GitForWindows", r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Git_is1"):
                try:
                    with winreg.OpenKey(root, subkey) as k:
                        install_path, _ = winreg.QueryValueEx(k, "InstallPath")
                        bash_cand = os.path.join(install_path, "bin", "bash.exe")
                        if os.path.isfile(bash_cand):
                            return os.path.abspath(bash_cand)
                except Exception:
                    pass
    except Exception:
        pass

    return None


def find_ani_cli(bash_path=None):
    """Find installed ani-cli binary, script, or cmd wrapper."""
    cfg = load_or_create_config()
    configured = cfg.get("ani_cli_path")
    if configured and os.path.isfile(configured):
        return configured

    # Check direct PATH
    p = shutil.which("ani-cli") or shutil.which("ani-cli.cmd") or shutil.which("ani-cli.bat")
    if p:
        return p

    # Standard Windows & Unix locations
    candidates = [
        os.path.expanduser(r"~\bin\ani-cli"),
        os.path.expanduser(r"~\bin\ani-cli.cmd"),
        r"C:\Tools\bin\ani-cli",
        r"C:\Tools\bin\ani-cli.cmd",
        os.path.expanduser(r"~\scoop\shims\ani-cli.cmd"),
        os.path.expanduser(r"~\scoop\apps\ani-cli\current\ani-cli"),
        "/usr/local/bin/ani-cli",
        "/usr/bin/ani-cli",
        os.path.expanduser("~/.local/bin/ani-cli"),
    ]
    for c in candidates:
        if c and os.path.isfile(c):
            return os.path.abspath(c)

    # Probe inside bash if on Windows
    b = bash_path or find_git_bash()
    if b and sys.platform == "win32":
        try:
            user_bin = os.path.expanduser(r"~\bin").replace("\\", "/")
            if len(user_bin) >= 2 and user_bin[1] == ":":
                user_bin = "/" + user_bin[0].lower() + user_bin[2:]
            res = subprocess.run(
                [b, "-lc", f'export PATH="$PATH:/c/Tools/bin:$HOME/bin:{user_bin}"; command -v ani-cli'],
                capture_output=True, text=True, timeout=5, check=False,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)
            )
            out = res.stdout.strip()
            if out:
                if len(out) >= 3 and out.startswith("/") and out[2] == "/":
                    win_p = out[1].upper() + ":\\" + out[3:].replace("/", "\\")
                    if os.path.isfile(win_p):
                        return win_p
                if os.path.isfile(out):
                    return out
        except Exception:
            pass

    return None


def add_dir_to_user_path(directory):
    """Add a directory to User PATH on Windows via registry and update current process PATH."""
    if sys.platform != "win32":
        return
    directory = os.path.abspath(directory)
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Environment", 0, winreg.KEY_READ | winreg.KEY_WRITE) as key:
            try:
                curr_path, ptype = winreg.QueryValueEx(key, "Path")
            except FileNotFoundError:
                curr_path, ptype = "", winreg.REG_EXPAND_SZ

            parts = [p for p in curr_path.split(";") if p]
            if directory.lower() not in [p.lower() for p in parts]:
                parts.append(directory)
                new_path = ";".join(parts)
                winreg.SetValueEx(key, "Path", 0, ptype, new_path)
                try:
                    import ctypes
                    HWND_BROADCAST = 0xFFFF
                    WM_SETTINGCHANGE = 0x001A
                    SMTO_ABORTIFHUNG = 0x0002
                    res = ctypes.c_ulong()
                    ctypes.windll.user32.SendMessageTimeoutW(
                        HWND_BROADCAST, WM_SETTINGCHANGE, 0, "Environment",
                        SMTO_ABORTIFHUNG, 5000, ctypes.byref(res)
                    )
                except Exception:
                    pass
    except Exception:
        pass

    curr_env = os.environ.get("PATH", "")
    if directory.lower() not in [p.lower() for p in curr_env.split(os.pathsep) if p]:
        os.environ["PATH"] = directory + os.pathsep + curr_env


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
_CACHED_CAPABILITIES = None


def detect_capabilities(config=None, force_refresh=False):
    global _CACHED_CAPABILITIES
    if _CACHED_CAPABILITIES is not None and not force_refresh:
        return _CACHED_CAPABILITIES

    cfg = config or {}
    ani_path = cfg.get("ani_cli_path") or find_ani_cli()

    version_str = None
    flags = {
        "vlc": True,
        "quality": True,
        "dub": True,
        "select_nth": True,
        "episode": True,
    }

    if ani_path:
        sub_kwargs = {
            "capture_output": True,
            "text": True,
            "timeout": 5,
            "check": False,
        }
        if sys.platform == "win32":
            sub_kwargs["creationflags"] = getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)
            sinfo = subprocess.STARTUPINFO()
            sinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            sinfo.wShowWindow = 0  # win32con.SW_HIDE
            sub_kwargs["startupinfo"] = sinfo

        try:
            ver_proc = subprocess.run([ani_path, "-V"], **sub_kwargs)
            v = ver_proc.stdout.strip() or ver_proc.stderr.strip()
            if v:
                version_str = v.splitlines()[0].strip()
        except Exception:
            pass

        try:
            help_proc = subprocess.run([ani_path, "--help"], **sub_kwargs)
            help_text = (help_proc.stdout + " " + help_proc.stderr).strip()
            if len(help_text) > 20:
                flags["vlc"] = bool("-v" in help_text or "--vlc" in help_text)
                flags["quality"] = bool("-q" in help_text or "--quality" in help_text)
                flags["dub"] = bool("--dub" in help_text)
                flags["select_nth"] = bool("-S" in help_text or "--select-nth" in help_text)
                flags["episode"] = bool("-e" in help_text or "--episode" in help_text)
        except Exception:
            pass

    ensure_windows_player_paths()
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
        git_bash = find_git_bash()
        if git_bash:
            term_detected = "git-bash"
            term_available = True
        elif shutil.which("wt") or shutil.which("wt.exe"):
            term_detected = "wt"
            term_available = True
        elif shutil.which("cmd") or shutil.which("cmd.exe"):
            term_detected = "cmd"
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

    _CACHED_CAPABILITIES = {
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
    return _CACHED_CAPABILITIES


# ── Terminal Launch Execution ────────────────────────────────────────
def launch_in_terminal(argv, capabilities, config, extra_env=None):
    term_info = capabilities.get("terminal", {})
    term_name = term_info.get("detected")
    custom_cmd = config.get("terminal_command")

    if custom_cmd:
        popen_kwargs = {"env": os.environ.copy()}
        if extra_env:
            popen_kwargs["env"].update(extra_env)
        if sys.platform == "win32":
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            startupinfo.wShowWindow = 1  # win32con.SW_SHOWNORMAL
            popen_kwargs["startupinfo"] = startupinfo
            popen_kwargs["creationflags"] = getattr(subprocess, "CREATE_NEW_CONSOLE", 0x00000010)

        if isinstance(custom_cmd, list):
            cmd = []
            for item in custom_cmd:
                if "{cmd}" in item:
                    cmd.extend(argv)
                else:
                    cmd.append(item)
            subprocess.Popen(cmd, **popen_kwargs)
            return
        elif isinstance(custom_cmd, str):
            quoted = " ".join(shlex.quote(a) for a in argv)
            final_str = custom_cmd.replace("{cmd}", quoted)
            # Never execute with shell=True; parse arguments safely
            parsed_cmd = shlex.split(final_str, posix=(sys.platform != "win32"))
            subprocess.Popen(parsed_cmd, **popen_kwargs)
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
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        # If an episode is specified, run silently in background so only MPV pops up.
        # If no episode is specified, show single visible console for interactive episode selection.
        has_episode = any(argv[i] == "-e" for i in range(len(argv) - 1))
        if has_episode:
            startupinfo.wShowWindow = 7  # win32con.SW_SHOWMINNOACTIVE (silent background scraping)
        else:
            startupinfo.wShowWindow = 1  # win32con.SW_SHOWNORMAL (single interactive window)

        win_env = os.environ.copy()
        win_env.pop("DISPLAY", None)
        # Prevent MSYS2/Git Bash from hiding the MPV/player GUI window when spawning in background
        win_env["ANI_CLI_NO_DETACH"] = "1"
        if extra_env:
            win_env.update(extra_env)

        git_bash = find_git_bash()

        if git_bash:
            # Run Git Bash directly using "$@" argument forwarding:
            # 1. Completely eliminates intermediate cmd.exe windows (only 1 window ever opens, or 0 when silent!)
            # 2. Preserves multi-word titles ("Witch Hat Atelier") perfectly without quote-stripping or truncation
            # 3. Executes the underlying bash ani-cli script directly, bypassing any .cmd wrappers
            user_bin = os.path.expanduser(r"~\bin").replace("\\", "/")
            if len(user_bin) >= 2 and user_bin[1] == ":":
                user_bin = "/" + user_bin[0].lower() + user_bin[2:]

            bash_script = (
                f'export PATH="$PATH:/c/Tools/bin:$HOME/bin:{user_bin}"; '
                'if command -v ani-cli >/dev/null 2>&1; then ani-cli "$@"; '
                'elif [ -f "$HOME/bin/ani-cli" ]; then "$HOME/bin/ani-cli" "$@"; '
                'elif [ -f "/c/Tools/bin/ani-cli" ]; then "/c/Tools/bin/ani-cli" "$@"; '
                f'elif [ -f "{user_bin}/ani-cli" ]; then "{user_bin}/ani-cli" "$@"; '
                'else ani-cli "$@"; fi'
            )
            cmd = [git_bash, "-l", "-c", bash_script, "ani-cli"] + argv[1:]
        else:
            cmd = ["cmd.exe", "/c", "call"] + argv

        subprocess.Popen(cmd, env=win_env, creationflags=creationflags, startupinfo=startupinfo)

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

        # Check local file & null origins
        if req_origin in ("null", "file://"):
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
        if player == "vlc" and sys.platform == "win32":
            # Map VLC to MPV on Windows for smooth, direct HLS playback
            player = "mpv"

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

            # On Windows, use our HLS proxy wrapper for VLC instead of -v flag
            # VLC can't forward --http-referrer to HLS segment requests (403 errors)
            # Our wrapper starts a local proxy that adds proper Referer headers
            vlc_extra_env = None
            if player == "vlc":
                if sys.platform == "win32":
                    # Use ANI_CLI_PLAYER to point to our custom VLC wrapper
                    bridge_dir = os.path.dirname(os.path.abspath(__file__))
                    wrapper_path = os.path.join(bridge_dir, "bridge", "aether-vlc-player.sh")
                    if not os.path.isfile(wrapper_path):
                        # Try sibling directory layout
                        wrapper_path = os.path.join(bridge_dir, "aether-vlc-player.sh")
                    if os.path.isfile(wrapper_path):
                        # Convert to MSYS path for Git Bash
                        msys_wrapper = wrapper_path.replace("\\", "/")
                        # Replace drive letter: C:/... -> /c/...
                        if len(msys_wrapper) >= 2 and msys_wrapper[1] == ":":
                            msys_wrapper = "/" + msys_wrapper[0].lower() + msys_wrapper[2:]
                        vlc_extra_env = {
                            "ANI_CLI_PLAYER": msys_wrapper,
                            "AETHER_HLS_PROXY": os.path.join(os.path.dirname(wrapper_path), "hls_proxy.py"),
                        }
                        # Don't pass -v: it would override ANI_CLI_PLAYER back to "vlc.exe".
                        # ani-cli's *vlc* case matches because our wrapper path contains "vlc".
                    else:
                        # Fallback: use -v directly (may get 403 on HLS)
                        sys.stderr.write(f"[WARN] VLC wrapper not found at {wrapper_path}, using -v flag directly\n")
                        argv.append("-v")
                else:
                    argv.append("-v")

            if player == "mpv":
                argv.append("--no-detach")

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
                launch_in_terminal(argv, caps, self.server.config, extra_env=vlc_extra_env)
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


# ── Setup & Autostart Management ─────────────────────────────────────
def ask_yes_no(prompt, default=True, auto_yes=False):
    """Prompt user for a yes/no answer or accept default in non-interactive/automated runs."""
    if auto_yes:
        sys.stdout.write(f"{prompt} [{'Y/n' if default else 'y/N'}]: Y (auto)\n")
        return True
    if not sys.stdin.isatty():
        return default
    suffix = " [Y/n]: " if default else " [y/N]: "
    try:
        reply = input(prompt + suffix).strip().lower()
        if not reply:
            return default
        return reply in ("y", "yes")
    except (EOFError, KeyboardInterrupt):
        sys.stdout.write("\n")
        return False


def run_setup(auto_yes=False):
    """Interactive first-time setup:
    1. Checks if bash exists; if not, asks to install Git Bash.
    2. Checks if ani-cli exists; if not, asks to install ani-cli.
    3. Checks if mpv exists; if not, asks to install mpv.
    4. Sets up autostart to launch bridge silently in background on login.
    """
    sys.stdout.write("\n=======================================================\n")
    sys.stdout.write("      Aether Bridge - First-Time Setup Wizard          \n")
    sys.stdout.write("=======================================================\n\n")

    ensure_windows_player_paths()

    # 1. Check Bash
    sys.stdout.write("--> [1/4] Checking for Bash...\n")
    bash_path = find_git_bash()
    if bash_path:
        sys.stdout.write(f"    [OK] Bash detected: {bash_path}\n\n")
    else:
        sys.stdout.write("    [!] Bash was not found on your system.\n")
        sys.stdout.write("        ani-cli is a POSIX shell script and requires Bash (Git Bash) on Windows.\n")
        if ask_yes_no("    Install Git for Windows (includes Git Bash) now?", default=True, auto_yes=auto_yes):
            installed = False
            if shutil.which("winget"):
                sys.stdout.write("    Installing Git via winget...\n")
                res = subprocess.run([
                    "winget", "install", "--id", "Git.Git", "-e",
                    "--source", "winget", "--accept-source-agreements", "--accept-package-agreements"
                ], check=False)
                installed = (res.returncode == 0)
            elif shutil.which("scoop"):
                sys.stdout.write("    Installing Git via scoop...\n")
                res = subprocess.run(["scoop", "install", "git"], check=False)
                installed = (res.returncode == 0)

            ensure_windows_player_paths()
            bash_path = find_git_bash()
            if bash_path:
                sys.stdout.write(f"    [OK] Git Bash installed: {bash_path}\n\n")
            elif not installed:
                sys.stdout.write("    [!] Could not install Git automatically.\n")
                sys.stdout.write("        Please install Git for Windows manually from: https://git-scm.com/download/win\n\n")
        else:
            sys.stdout.write("    [-] Skipped Git Bash installation.\n\n")

    # 2. Check ani-cli
    sys.stdout.write("--> [2/4] Checking for ani-cli...\n")
    ani_path = find_ani_cli(bash_path=bash_path)
    if ani_path:
        sys.stdout.write(f"    [OK] ani-cli detected: {ani_path}\n\n")
    else:
        sys.stdout.write("    [!] ani-cli was not found on your system.\n")
        if ask_yes_no("    Install ani-cli now?", default=True, auto_yes=auto_yes):
            installed = False
            if shutil.which("scoop"):
                sys.stdout.write("    Installing ani-cli via scoop...\n")
                res = subprocess.run(["scoop", "install", "ani-cli"], check=False)
                installed = (res.returncode == 0)

            if not installed:
                user_bin = os.path.expanduser(r"~\bin")
                os.makedirs(user_bin, exist_ok=True)
                target_script = os.path.join(user_bin, "ani-cli")
                sys.stdout.write(f"    Downloading latest ani-cli to {target_script}...\n")
                try:
                    import urllib.request
                    url = "https://raw.githubusercontent.com/pystardust/ani-cli/master/ani-cli"
                    req = urllib.request.Request(url, headers={"User-Agent": "AetherBridgeSetup/1.0"})
                    with urllib.request.urlopen(req, timeout=15) as resp:
                        content = resp.read()
                    content = content.replace(b"\r\n", b"\n")
                    with open(target_script, "wb") as f:
                        f.write(content)

                    if sys.platform == "win32":
                        cmd_wrapper = os.path.join(user_bin, "ani-cli.cmd")
                        bash_target = bash_path or "bash.exe"
                        with open(cmd_wrapper, "w", encoding="utf-8") as f:
                            f.write(
                                '@echo off\r\n'
                                'setlocal\r\n'
                                f'set "BASH_EXE={bash_target}"\r\n'
                                'if not exist "%BASH_EXE%" set "BASH_EXE=bash.exe"\r\n'
                                '"%BASH_EXE%" -lc "ani-cli %*"\r\n'
                            )
                        add_dir_to_user_path(user_bin)
                    else:
                        os.chmod(target_script, 0o755)

                    installed = True
                    sys.stdout.write(f"    [OK] Downloaded and configured ani-cli: {target_script}\n")
                except Exception as e:
                    sys.stdout.write(f"    [!] Failed to download ani-cli: {e}\n")

            ensure_windows_player_paths()
            ani_path = find_ani_cli(bash_path=bash_path)
            if ani_path:
                sys.stdout.write(f"    [OK] ani-cli verified: {ani_path}\n\n")
            else:
                sys.stdout.write("    [!] Could not verify ani-cli. Please restart your shell.\n\n")
        else:
            sys.stdout.write("    [-] Skipped ani-cli installation.\n\n")

    # 3. Check MPV
    sys.stdout.write("--> [3/4] Checking for video player (mpv)...\n")
    mpv_path = shutil.which("mpv") or shutil.which("mpv.exe")
    if mpv_path:
        sys.stdout.write(f"    [OK] mpv detected: {mpv_path}\n\n")
    else:
        sys.stdout.write("    [!] mpv was not found on your system.\n")
        sys.stdout.write("        mpv is the recommended player for Aether Codex (direct HLS, sound & subtitles).\n")
        if ask_yes_no("    Install mpv now?", default=True, auto_yes=auto_yes):
            if sys.platform == "win32":
                if shutil.which("winget"):
                    sys.stdout.write("    Installing mpv via winget...\n")
                    subprocess.run([
                        "winget", "install", "--id", "shinchiro.mpv", "-e",
                        "--accept-source-agreements", "--accept-package-agreements"
                    ], check=False)
                elif shutil.which("scoop"):
                    sys.stdout.write("    Installing mpv via scoop...\n")
                    subprocess.run(["scoop", "install", "mpv"], check=False)
            elif sys.platform.startswith("linux"):
                sys.stdout.write("    Please install mpv via: sudo pacman -S mpv (or sudo apt install mpv)\n")

            ensure_windows_player_paths()
            mpv_path = shutil.which("mpv") or shutil.which("mpv.exe")
            if mpv_path:
                sys.stdout.write(f"    [OK] mpv installed: {mpv_path}\n\n")
        else:
            sys.stdout.write("    [-] Skipped mpv installation.\n\n")

    # 4. Autostart
    sys.stdout.write("--> [4/4] Autostart Configuration...\n")
    if ask_yes_no("    Configure Aether Bridge to launch automatically in background on login?", default=True, auto_yes=auto_yes):
        install_autostart()
    else:
        sys.stdout.write("    [-] Skipped autostart. You can start the bridge manually anytime with: python aether-bridge.py\n\n")

    # Refresh cached capabilities so the running process picks up everything
    detect_capabilities(force_refresh=True)

    sys.stdout.write("=======================================================\n")
    sys.stdout.write("          Aether Bridge Setup Complete!                \n")
    sys.stdout.write("=======================================================\n\n")
    return 0


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

        # Check if bridge is already running, if not launch it immediately
        port = CONFIGURED_PORT if isinstance(CONFIGURED_PORT, int) else 47619
        already_running = False
        try:
            import urllib.request
            req = urllib.request.Request(f"http://127.0.0.1:{port}/ping")
            with urllib.request.urlopen(req, timeout=1):
                already_running = True
        except Exception:
            already_running = False

        if not already_running:
            try:
                subprocess.Popen(["wscript.exe", vbs_path])
                sys.stdout.write("  Status:           Started immediately in background\n")
            except Exception:
                pass
        else:
            sys.stdout.write("  Status:           Bridge is already running\n")

        sys.stdout.write("\nThe bridge is active and will start automatically in the background whenever you log in.\n")
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
    parser.add_argument("--setup", action="store_true", help="Interactive first-time setup: check & install dependencies and autostart")
    parser.add_argument("-y", "--yes", action="store_true", help="Automatically accept all setup prompts without asking")
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

    if args.setup:
        code = run_setup(auto_yes=args.yes)
        sys.exit(code)

    if args.install_autostart:
        # If run interactively and bash or ani-cli is missing, offer setup wizard
        if sys.stdin.isatty():
            caps = detect_capabilities()
            bash_found = bool(find_git_bash())
            ani_found = bool(caps.get("ani_cli", {}).get("available"))
            if not bash_found or not ani_found:
                sys.stdout.write("[!] Missing required dependencies for ani-cli bridge.\n")
                if ask_yes_no("Run first-time setup wizard to configure dependencies now?", default=True, auto_yes=args.yes):
                    code = run_setup(auto_yes=args.yes)
                    sys.exit(code)
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
