#!/usr/bin/env python3
"""
Aether Codex — Local HLS Referrer Proxy

A lightweight HTTP proxy that sits between VLC and the HLS CDN.
VLC can't forward --http-referrer to HLS segment requests, so this
proxy intercepts all requests and adds the correct Referer header.

Usage (from ani-cli or aether-bridge):
    python hls_proxy.py <m3u8_url> <referer_url> [--sub <subtitle_url>] [--title <title>] [--vlc-path <path>]

The proxy:
1. Starts a local HTTP server on a random available port
2. Rewrites the m3u8 playlist so all segment URLs point through the proxy
3. Launches VLC pointing at the local proxy URL
4. Shuts down when VLC exits
"""

import http.server
import json
import os
import re
import signal
import socket
import subprocess
import sys
import shutil
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from functools import lru_cache

# ── Configuration ────────────────────────────────────────────────────
PROXY_BIND = "127.0.0.1"
IDLE_TIMEOUT_SECS = 300  # Shut down if no requests for 5 minutes
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"


class HLSProxyState:
    """Shared state for the proxy server."""
    def __init__(self, referer, origin=None):
        self.referer = referer
        self.origin = origin or referer
        self.last_request_time = time.time()
        self.vlc_process = None
        self.port = 0
        self.shutdown_event = threading.Event()
        self.lock = threading.Lock()

    def touch(self):
        with self.lock:
            self.last_request_time = time.time()

    def seconds_idle(self):
        with self.lock:
            return time.time() - self.last_request_time


class HLSProxyHandler(http.server.BaseHTTPRequestHandler):
    """HTTP handler that proxies HLS requests with proper Referer."""

    def log_message(self, format, *args):
        # Quiet logging — only errors
        pass

    def log_error(self, format, *args):
        sys.stderr.write(f"[proxy] {format % args}\n")

    def do_GET(self):
        state = self.server.proxy_state
        state.touch()

        parsed = urllib.parse.urlparse(self.path)
        query = urllib.parse.parse_qs(parsed.query)

        # The proxy encodes the real URL as a query parameter
        real_url = query.get("url", [None])[0]
        if not real_url:
            self.send_error(400, "Missing 'url' query parameter")
            return

        try:
            real_url = urllib.parse.unquote(real_url)
        except Exception:
            self.send_error(400, "Invalid URL encoding")
            return

        # Validate the URL is HTTP(S)
        if not real_url.startswith(("http://", "https://")):
            self.send_error(400, "Only http/https URLs are supported")
            return

        try:
            content, content_type, status_code = self._fetch_with_referrer(real_url, state.referer)
        except urllib.error.HTTPError as e:
            self.send_error(e.code, f"Upstream error: {e.reason}")
            return
        except Exception as e:
            self.send_error(502, f"Proxy fetch failed: {e}")
            return

        # If this is an m3u8 playlist, rewrite URLs to go through the proxy
        is_m3u8 = (
            "mpegurl" in (content_type or "").lower()
            or real_url.lower().endswith(".m3u8")
            or (content_type or "").startswith("application/vnd.apple")
        )

        if is_m3u8:
            content = self._rewrite_m3u8(content, real_url, state.port)

        self.send_response(status_code)
        self.send_header("Content-Type", content_type or "application/octet-stream")
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(content)

    def _fetch_with_referrer(self, url, referer):
        """Fetch a URL with the proper Referer header."""
        headers = {
            "User-Agent": USER_AGENT,
            "Referer": referer,
            "Origin": referer.rstrip("/"),
        }

        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=30) as resp:
            content = resp.read()
            content_type = resp.headers.get("Content-Type", "application/octet-stream")
            return content, content_type, resp.status

    def _rewrite_m3u8(self, content_bytes, base_url, proxy_port):
        """Rewrite m3u8 playlist URLs to go through the local proxy."""
        try:
            text = content_bytes.decode("utf-8")
        except UnicodeDecodeError:
            return content_bytes

        base_dir = base_url.rsplit("/", 1)[0] + "/"
        lines = text.splitlines()
        rewritten = []

        for line in lines:
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                # Check for URI= attributes in EXT tags (e.g., #EXT-X-KEY, #EXT-X-MAP)
                if "URI=" in stripped:
                    line = re.sub(
                        r'URI="([^"]*)"',
                        lambda m: f'URI="{self._proxy_url(m.group(1), base_dir, proxy_port)}"',
                        line
                    )
                rewritten.append(line)
            else:
                # This is a segment URL
                rewritten.append(self._proxy_url(stripped, base_dir, proxy_port))

        return "\n".join(rewritten).encode("utf-8")

    def _proxy_url(self, url, base_dir, proxy_port):
        """Convert a URL to a proxied URL."""
        if url.startswith(("http://", "https://")):
            absolute_url = url
        else:
            absolute_url = base_dir + url

        encoded = urllib.parse.quote(absolute_url, safe="")
        return f"http://{PROXY_BIND}:{proxy_port}/proxy?url={encoded}"


def find_free_port():
    """Find a free TCP port."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind((PROXY_BIND, 0))
        return s.getsockname()[1]


def find_vlc():
    """Find VLC executable on Windows."""
    # Try PATH first
    vlc = shutil.which("vlc") or shutil.which("vlc.exe")
    if vlc:
        return vlc

    # Try common install locations
    candidates = [
        r"C:\Program Files\VideoLAN\VLC\vlc.exe",
        r"C:\Program Files (x86)\VideoLAN\VLC\vlc.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\Programs\VideoLAN\VLC\vlc.exe"),
        os.path.expanduser(r"~\scoop\apps\vlc\current\vlc.exe"),
    ]
    for c in candidates:
        if os.path.isfile(c):
            return c
    return None


def launch_vlc(proxy_url, state, title=None, sub_url=None, vlc_path=None):
    """Launch VLC pointing at the proxy URL."""
    vlc = vlc_path or find_vlc()
    if not vlc:
        sys.stderr.write("[proxy] ERROR: VLC executable not found!\n")
        state.shutdown_event.set()
        return

    cmd = [vlc]
    cmd.extend(["--play-and-exit"])

    if title:
        cmd.append(f"--meta-title={title}")

    cmd.append(proxy_url)

    if sub_url:
        # Proxy the subtitle URL too
        encoded_sub = urllib.parse.quote(sub_url, safe="")
        proxied_sub = f"http://{PROXY_BIND}:{state.port}/proxy?url={encoded_sub}"
        cmd.append(f":input-slave={proxied_sub}")

    sys.stderr.write(f"[proxy] Launching VLC: {' '.join(cmd)}\n")

    # Ensure VLC opens in a visible window
    env = os.environ.copy()
    env.pop("DISPLAY", None)

    kwargs = {"env": env}
    if sys.platform == "win32":
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        startupinfo.wShowWindow = 1  # SW_SHOWNORMAL
        kwargs["startupinfo"] = startupinfo

    state.vlc_process = subprocess.Popen(cmd, **kwargs)

    # Wait for VLC to exit, then signal shutdown
    state.vlc_process.wait()
    sys.stderr.write(f"[proxy] VLC exited with code {state.vlc_process.returncode}\n")
    state.shutdown_event.set()


def idle_watchdog(state):
    """Shut down the proxy if idle for too long."""
    while not state.shutdown_event.is_set():
        state.shutdown_event.wait(timeout=30)
        if state.shutdown_event.is_set():
            break
        if state.seconds_idle() > IDLE_TIMEOUT_SECS:
            sys.stderr.write("[proxy] Idle timeout reached, shutting down.\n")
            if state.vlc_process and state.vlc_process.poll() is None:
                state.vlc_process.terminate()
            state.shutdown_event.set()
            break


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Local HLS proxy for VLC")
    parser.add_argument("m3u8_url", help="The HLS m3u8 playlist URL")
    parser.add_argument("referer", help="The Referer URL to send with requests")
    parser.add_argument("--sub", help="Subtitle URL", default=None)
    parser.add_argument("--title", help="Video title for VLC window", default=None)
    parser.add_argument("--vlc-path", help="Path to VLC executable", default=None)
    parser.add_argument("--port", type=int, help="Port to use (default: auto)", default=0)
    args = parser.parse_args()

    port = args.port or find_free_port()
    state = HLSProxyState(referer=args.referer)
    state.port = port

    # Create and start the proxy server
    server = http.server.HTTPServer((PROXY_BIND, port), HLSProxyHandler)
    server.proxy_state = state

    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()

    sys.stderr.write(f"[proxy] HLS proxy listening on http://{PROXY_BIND}:{port}\n")

    # Build the proxied m3u8 URL for VLC
    encoded_m3u8 = urllib.parse.quote(args.m3u8_url, safe="")
    proxy_url = f"http://{PROXY_BIND}:{port}/proxy?url={encoded_m3u8}"

    # Start idle watchdog
    watchdog_thread = threading.Thread(target=idle_watchdog, args=(state,), daemon=True)
    watchdog_thread.start()

    # Launch VLC in a separate thread
    vlc_thread = threading.Thread(
        target=launch_vlc,
        args=(proxy_url, state, args.title, args.sub, args.vlc_path),
        daemon=True,
    )
    vlc_thread.start()

    # Wait for shutdown signal
    try:
        state.shutdown_event.wait()
    except KeyboardInterrupt:
        sys.stderr.write("\n[proxy] Interrupted, shutting down.\n")
        if state.vlc_process and state.vlc_process.poll() is None:
            state.vlc_process.terminate()

    server.shutdown()
    sys.stderr.write("[proxy] Proxy shut down.\n")


if __name__ == "__main__":
    main()
