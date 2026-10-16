#!/usr/bin/env python3
"""
tests/bridge/test_bridge.py — Comprehensive Unit Tests for Aether Bridge
Tests all security requirements, endpoints, rate limits, validation, and CLI options.
Uses only Python standard library.
"""

import http.client
import importlib.util
import json
import os
import sys
import threading
import time
import unittest

# Import the template module dynamically
TEMPLATE_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "bridge", "aether-bridge.template.py")
)
spec = importlib.util.spec_from_file_location("aether_bridge", TEMPLATE_PATH)
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)


class TestAetherBridge(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Start the server on an ephemeral port
        cls.token = "aether-test-secret-token-abcdef123456"
        cls.allowed_origin = "https://aethercodex.pages.dev"

        cls.server = bridge.ThreadingHTTPServer(("127.0.0.1", 0), bridge.AetherBridgeHandler)
        cls.port = cls.server.server_address[1]
        cls.server.auth_token = cls.token
        cls.server.allowed_origin = cls.allowed_origin
        cls.server.port = cls.port
        cls.server.dry_run = True
        cls.server.config = {
            "ani_cli_path": "ani-cli",
            "terminal_command": "",
            "default_settings": {},
        }
        cls.server.rate_limiter = bridge.RateLimiter()

        # Mock detect_capabilities to return predictable capabilities for unit tests
        cls.original_detect = bridge.detect_capabilities
        bridge.detect_capabilities = lambda cfg=None: {
            "ok": True,
            "version": "1.0.0",
            "ani_cli": {
                "path": "ani-cli",
                "version": "5.1.5",
                "available": True,
                "flags": {
                    "vlc": True,
                    "quality": True,
                    "dub": True,
                    "select_nth": True,
                    "episode": True,
                },
            },
            "players": {"mpv": True, "vlc": True},
            "terminal": {"detected": "wt", "available": True},
        }

        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        time.sleep(0.05)

    @classmethod
    def tearDownClass(cls):
        bridge.detect_capabilities = cls.original_detect
        cls.server.shutdown()
        cls.server.server_close()

    def setUp(self):
        # Reset rate limiter before each test to avoid interference
        self.server.rate_limiter = bridge.RateLimiter()

    def request(self, method, path, headers=None, body=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        req_headers = {
            "Host": f"127.0.0.1:{self.port}",
            "Origin": self.allowed_origin,
            "X-Aether-Token": self.token,
        }
        if headers:
            req_headers.update(headers)
        # Filter out headers explicitly set to None
        req_headers = {k: v for k, v in req_headers.items() if v is not None}

        if body is not None and not isinstance(body, (bytes, str)):
            body = json.dumps(body)
            if "Content-Type" not in req_headers:
                req_headers["Content-Type"] = "application/json"

        conn.request(method, path, body=body, headers=req_headers)
        res = conn.getresponse()
        data = res.read().decode("utf-8")
        conn.close()

        json_data = None
        try:
            json_data = json.loads(data)
        except Exception:
            pass

        return res.status, res.headers, json_data, data

    # ── Authentication & Token Validation ─────────────────────────────
    def test_missing_token_returns_401(self):
        status, _, body, _ = self.request("GET", "/ping", headers={"X-Aether-Token": None})
        self.assertEqual(status, 401)
        self.assertFalse(body.get("ok"))
        self.assertIn("Unauthorized", body.get("error", ""))

    def test_incorrect_token_returns_401(self):
        status, _, body, _ = self.request("GET", "/ping", headers={"X-Aether-Token": "wrong-token"})
        self.assertEqual(status, 401)
        self.assertFalse(body.get("ok"))
        self.assertIn("Unauthorized", body.get("error", ""))

    def test_valid_token_ping_returns_200(self):
        status, _, body, _ = self.request("GET", "/ping")
        self.assertEqual(status, 200)
        self.assertTrue(body.get("ok"))
        self.assertIn("version", body)
        self.assertIn("os", body)

    # ── Origin & Host Validation ──────────────────────────────────────
    def test_invalid_origin_returns_403(self):
        status, _, body, _ = self.request("GET", "/ping", headers={"Origin": "https://malicious-website.com"})
        self.assertEqual(status, 403)
        self.assertFalse(body.get("ok"))
        self.assertIn("Forbidden", body.get("error", ""))

    def test_localhost_dev_origins_allowed(self):
        for dev_origin in [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:8787",
            "http://127.0.0.1:8787",
            "http://localhost",
            "http://127.0.0.1",
        ]:
            status, headers, body, _ = self.request("GET", "/ping", headers={"Origin": dev_origin})
            self.assertEqual(status, 200, f"Failed for dev origin {dev_origin}")
            self.assertTrue(body.get("ok"))
            self.assertEqual(headers.get("Access-Control-Allow-Origin"), dev_origin)

    def test_invalid_host_returns_403(self):
        status, _, body, _ = self.request("GET", "/ping", headers={"Host": "attacker.com"})
        self.assertEqual(status, 403)
        self.assertFalse(body.get("ok"))

    # ── CORS Preflight Requirements ───────────────────────────────────
    def test_preflight_cors_and_private_network_headers(self):
        status, headers, _, _ = self.request(
            "OPTIONS",
            "/play",
            headers={
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "Content-Type, X-Aether-Token",
                "X-Aether-Token": None,  # Preflight does not include custom headers
            },
        )
        self.assertEqual(status, 204)
        self.assertEqual(headers.get("Access-Control-Allow-Origin"), self.allowed_origin)
        self.assertEqual(headers.get("Vary"), "Origin")
        self.assertEqual(headers.get("Access-Control-Allow-Private-Network"), "true")
        self.assertIn("X-Aether-Token", headers.get("Access-Control-Allow-Headers", ""))
        self.assertIn("POST", headers.get("Access-Control-Allow-Methods", ""))

    # ── Capabilities Endpoint ─────────────────────────────────────────
    def test_capabilities_endpoint(self):
        status, _, body, _ = self.request("GET", "/capabilities")
        self.assertEqual(status, 200)
        self.assertTrue(body.get("ok"))
        self.assertIn("ani_cli", body)
        self.assertIn("players", body)
        self.assertIn("terminal", body)
        self.assertTrue(body["ani_cli"]["flags"]["quality"])
        self.assertTrue(body["ani_cli"]["flags"]["vlc"])

    # ── Rate Limiting & Debounce ──────────────────────────────────────
    def test_rate_limit_and_debounce(self):
        # 1. First launch should succeed
        status, _, body, _ = self.request("POST", "/play", body={"title": "Naruto"})
        self.assertEqual(status, 200)
        self.assertTrue(body.get("ok"))

        # 2. Immediate second launch within 2s should trigger debounce (429)
        status, _, body, _ = self.request("POST", "/play", body={"title": "Bleach"})
        self.assertEqual(status, 429)
        self.assertFalse(body.get("ok"))
        self.assertIn("Debounce active", body.get("error", ""))

        # 3. Simulate rolling window limit: 5 launches in 60s
        self.server.rate_limiter = bridge.RateLimiter()
        now = time.time()
        # Seed 5 recent launches in history (all older than 2s debounce)
        self.server.rate_limiter.launch_history = [now - 10, now - 8, now - 6, now - 4, now - 3]
        self.server.rate_limiter.last_launch_time = now - 3

        status, _, body, _ = self.request("POST", "/play", body={"title": "One Piece"})
        self.assertEqual(status, 429)
        self.assertIn("maximum 5 launches per minute", body.get("error", ""))

    # ── Request Body Size Limit (4 KB) ────────────────────────────────
    def test_request_body_size_limit(self):
        oversized = {"title": "A" * 5000}
        status, _, body, _ = self.request("POST", "/play", body=oversized)
        self.assertEqual(status, 413)
        self.assertIn("Payload Too Large", body.get("error", ""))

    # ── Command Construction & Options Combinations ───────────────────
    def test_default_options_argv(self):
        status, _, body, _ = self.request(
            "POST",
            "/play",
            body={
                "title": "Frieren: Beyond Journey's End",
                "settings": {
                    "player": "mpv",
                    "quality": "auto",
                    "audio": "sub",
                    "autoSelect": True,
                },
            },
        )
        self.assertEqual(status, 200)
        expected_argv = ["ani-cli", "-S", "1", "Frieren: Beyond Journey's End"]
        self.assertEqual(body.get("argv"), expected_argv)

    def test_full_options_argv(self):
        status, _, body, _ = self.request(
            "POST",
            "/play",
            body={
                "title": "Steins;Gate",
                "episode": 12,
                "settings": {
                    "player": "vlc",
                    "quality": "1080",
                    "audio": "dub",
                    "autoSelect": True,
                },
            },
        )
        self.assertEqual(status, 200)
        expected_argv = ["ani-cli", "-v", "-q", "1080", "--dub", "-S", "1", "-e", "12", "Steins;Gate"]
        self.assertEqual(body.get("argv"), expected_argv)

    def test_no_autoselect_argv(self):
        status, _, body, _ = self.request(
            "POST",
            "/play",
            body={
                "title": "Cowboy Bebop",
                "settings": {
                    "autoSelect": False,
                },
            },
        )
        self.assertEqual(status, 200)
        expected_argv = ["ani-cli", "Cowboy Bebop"]
        self.assertEqual(body.get("argv"), expected_argv)

    # ── Input Validation & Hostile Title Payloads ─────────────────────
    def test_hostile_valid_text_remains_single_inert_argv(self):
        """Hostile command injection text must remain a single, inert argument."""
        payloads = [
            '"; touch /tmp/pwn"',
            "$(touch /tmp/pwn)",
            "`id`",
            "Anime & rm -rf /",
            "Anime | cat /etc/passwd",
        ]
        for hostile_title in payloads:
            self.server.rate_limiter = bridge.RateLimiter()  # reset debounce
            status, _, body, _ = self.request("POST", "/play", body={"title": hostile_title})
            self.assertEqual(status, 200, f"Failed for title: {hostile_title}")
            argv = body.get("argv", [])
            # Title MUST be the last item and exact string, never split
            self.assertEqual(argv[-1], hostile_title)
            # Length should be exactly 4: ['ani-cli', '-S', '1', hostile_title]
            self.assertEqual(len(argv), 4)

    def test_unicode_and_japanese_titles(self):
        japanese_titles = [
            "葬送のフリーレン",
            "進撃の巨人 The Final Season",
            "SPY×FAMILY",
        ]
        for t in japanese_titles:
            self.server.rate_limiter = bridge.RateLimiter()
            status, _, body, _ = self.request("POST", "/play", body={"title": t})
            self.assertEqual(status, 200)
            self.assertEqual(body["argv"][-1], t)

    def test_rejected_titles(self):
        invalid_titles = [
            "--dub",               # Leading hyphen (flag injection attempt)
            "-e 99",               # Leading hyphen
            "Title\nwith newline", # Newline
            "Title\rwith return",  # Carriage return
            "Title\0with NUL",     # NUL character
            "",                    # Empty
            "   ",                 # Whitespace only
            "A" * 201,             # Over 200 characters
        ]
        for inv in invalid_titles:
            self.server.rate_limiter = bridge.RateLimiter()
            status, _, body, _ = self.request("POST", "/play", body={"title": inv})
            self.assertEqual(status, 400, f"Expected 400 for title: {repr(inv)}")
            self.assertFalse(body.get("ok"))

    def test_episode_validation(self):
        invalid_episodes = [0, -1, 10000, "5", True, False, 1.5]
        for ep in invalid_episodes:
            self.server.rate_limiter = bridge.RateLimiter()
            status, _, body, _ = self.request(
                "POST",
                "/play",
                body={"title": "Valid Title", "episode": ep},
            )
            self.assertEqual(status, 400, f"Expected 400 for episode: {repr(ep)}")

    def test_unknown_enum_and_settings_rejected(self):
        bad_settings = [
            {"player": "potplayer"},
            {"quality": "4k"},
            {"audio": "japanese"},
            {"autoSelect": "yes"},
            {"extra_field": "injected"},
        ]
        for s in bad_settings:
            self.server.rate_limiter = bridge.RateLimiter()
            status, _, body, _ = self.request(
                "POST",
                "/play",
                body={"title": "Valid Title", "settings": s},
            )
            self.assertEqual(status, 400, f"Expected 400 for settings: {s}")

    def test_unsupported_flags_return_clear_error(self):
        # Override capabilities so that --dub is NOT supported
        orig = bridge.detect_capabilities
        bridge.detect_capabilities = lambda cfg=None: {
            "ok": True,
            "version": "1.0.0",
            "ani_cli": {
                "path": "ani-cli",
                "version": "1.0.0",
                "available": True,
                "flags": {
                    "vlc": True,
                    "quality": True,
                    "dub": False,  # Not supported
                    "select_nth": True,
                    "episode": True,
                },
            },
            "players": {"mpv": True, "vlc": True},
            "terminal": {"detected": "wt", "available": True},
        }

        try:
            self.server.rate_limiter = bridge.RateLimiter()
            status, _, body, _ = self.request(
                "POST",
                "/play",
                body={"title": "Valid Title", "settings": {"audio": "dub"}},
            )
            self.assertEqual(status, 400)
            self.assertIn("--dub flag is not supported", body.get("error", ""))
        finally:
            bridge.detect_capabilities = orig

    def test_missing_executable_returns_clear_error(self):
        orig = bridge.detect_capabilities
        bridge.detect_capabilities = lambda cfg=None: {
            "ok": True,
            "version": "1.0.0",
            "ani_cli": {
                "path": None,
                "version": None,
                "available": False,
                "flags": {},
            },
            "players": {},
            "terminal": {"detected": None, "available": False},
        }

        try:
            self.server.rate_limiter = bridge.RateLimiter()
            status, _, body, _ = self.request("POST", "/play", body={"title": "Valid Title"})
            self.assertEqual(status, 500)
            self.assertIn("not found", body.get("error", ""))
        finally:
            bridge.detect_capabilities = orig


if __name__ == "__main__":
    unittest.main()
