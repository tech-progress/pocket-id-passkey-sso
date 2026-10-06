import hashlib
import hmac
import http.client
import json
import os
import signal
import sqlite3
from contextlib import closing
import subprocess
import sys
import threading
import time
from http.cookies import CookieError, SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit


COOKIE = "__Host-pocket-gate"
MAX_BODY = 16 * 1024 * 1024
SESSION_SECONDS = 900
HOP_HEADERS = {"connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
               "te", "trailer", "transfer-encoding", "upgrade"}
OPERATOR_PAGE = b"""<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width"><title>Pocket ID operator gate</title>
<h1>Pocket ID operator gate</h1>
<p>Use only the final HTTPS issuer origin. This token unlocks the proxy, not Pocket ID administration.</p>
<form method="post" action="/_operator/session"><label>Operator token
<input type="password" name="token" required autocomplete="off"></label>
<button>Open 15-minute setup session</button></form>
<p>Complete owner enrollment at /signup/setup and register two independent authenticators.
Then return here while this operator session is valid.</p>
<form method="post" action="/_operator/activate"><button>Activate after owner enrollment</button></form>
<p>Activation verifies two stored owner credentials. It cannot prove they are independent devices.
Set GATE_FORCE_LOCK=false and redeploy only after the operator checks succeed.</p>
<form method="post" action="/_operator/lock"><button>Lock all public application routes</button></form>
</html>"""


class Gate:
    def __init__(self, env, data=Path("/app/data")):
        self.origin = env.get("APP_URL", "")
        parsed = urlsplit(self.origin)
        if (parsed.scheme != "https" or not parsed.hostname or parsed.username or
                parsed.password or parsed.path or parsed.query or parsed.fragment or
                self.origin != f"https://{parsed.netloc}" or parsed.netloc != parsed.netloc.lower()):
            raise ValueError("APP_URL must be a canonical lowercase HTTPS origin without a trailing slash")
        self.host = parsed.netloc
        self.key = env.get("ENCRYPTION_KEY", "").encode()
        self.token = env.get("GATE_ADMIN_TOKEN", "").encode()
        if len(self.key) < 32 or len(self.token) < 32 or self.key == self.token:
            raise ValueError("Separate ENCRYPTION_KEY and GATE_ADMIN_TOKEN of at least 32 bytes are required")
        if env.get("STATIC_API_KEY") or env.get("STATIC_API_KEY_FILE"):
            raise ValueError("STATIC_API_KEY is not permitted: the operator gate is not an application admin key")
        lock = env.get("GATE_FORCE_LOCK", "true")
        if lock not in {"true", "false"}:
            raise ValueError("GATE_FORCE_LOCK must be true or false")
        self.force_lock = lock == "true"
        self.data = data
        self.state = data / "gateway-state.json"
        self.database = data / "pocket-id.db"
        self.state_lock = threading.Lock()

    def signature(self, payload, key):
        return hmac.new(key, payload.encode(), hashlib.sha256).hexdigest()

    def session(self):
        payload = str(int(time.time()) + SESSION_SECONDS)
        return f"{payload}.{self.signature(self.origin + ':' + payload, self.token)}"

    def authenticated(self, raw_cookie):
        try:
            cookies = SimpleCookie(raw_cookie or "")
            value = cookies[COOKIE].value
            expiry, signature = value.split(".")
            now = int(time.time())
            return (now < int(expiry) <= now + SESSION_SECONDS and
                    hmac.compare_digest(signature, self.signature(self.origin + ':' + expiry, self.token)))
        except (CookieError, KeyError, ValueError):
            return False

    def enrolled_owner(self, owner=None):
        with closing(sqlite3.connect(f"file:{self.database}?mode=ro", uri=True, timeout=2)) as database:
            rows = database.execute(
                "SELECT users.id FROM users JOIN webauthn_credentials "
                "ON users.id = webauthn_credentials.user_id "
                "WHERE users.is_admin = 1 AND users.disabled = 0 AND users.id != ? "
                "AND length(webauthn_credentials.public_key) > 0 "
                "AND length(webauthn_credentials.credential_id) > 0 "
                "GROUP BY users.id HAVING count(*) >= 2",
                ("00000000-0000-0000-0000-000000000000",),
            ).fetchall()
        return next((row[0] for row in rows if owner is None or owner == row[0]), None)

    def active(self):
        if self.force_lock:
            return False
        try:
            envelope = json.loads(self.state.read_text())
            payload = envelope["payload"]
            if not hmac.compare_digest(envelope["signature"], self.signature(payload, self.key)):
                return False
            state = json.loads(payload)
            return (state["origin"] == self.origin and
                    self.enrolled_owner(state["owner"]) is not None)
        except (OSError, ValueError, KeyError, TypeError, sqlite3.Error):
            return False

    def activate(self):
        owner = self.enrolled_owner()
        if owner is None:
            return False
        payload = json.dumps({"origin": self.origin, "owner": owner}, sort_keys=True)
        envelope = json.dumps({"payload": payload, "signature": self.signature(payload, self.key)})
        with self.state_lock:
            temporary = self.state.with_suffix(".tmp")
            with temporary.open("w") as handle:
                os.chmod(temporary, 0o600)
                handle.write(envelope)
                handle.flush()
                os.fsync(handle.fileno())
            temporary.replace(self.state)
            directory = os.open(self.data, os.O_RDONLY)
            try:
                os.fsync(directory)
            finally:
                os.close(directory)
        return True

    def lock(self):
        with self.state_lock:
            self.state.unlink(missing_ok=True)
            directory = os.open(self.data, os.O_RDONLY)
            try:
                os.fsync(directory)
            finally:
                os.close(directory)


def normalized_path(raw):
    parsed = urlsplit(raw)
    if parsed.scheme or parsed.netloc or parsed.fragment:
        raise ValueError("Only origin-form request targets are supported")
    path = unquote(parsed.path, errors="strict")
    if (not path.startswith("/") or "//" in path or "\\" in path or "%" in path or
            any(segment in {".", ".."} for segment in path.split("/")) or
            any(ord(character) < 32 for character in path)):
        raise ValueError("Ambiguous request path")
    return path.rstrip("/") or "/"


class Handler(BaseHTTPRequestHandler):
    server_version = "PocketGate"
    sys_version = ""

    def setup(self):
        super().setup()
        self.connection.settimeout(10)

    def log_message(self, format_string, *args):
        pass

    def respond(self, status, payload=b"", content_type="application/json", headers=()):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "same-origin")
        self.send_header("Strict-Transport-Security", "max-age=31536000")
        self.send_header("Content-Security-Policy", "default-src 'none'; form-action 'self'; frame-ancestors 'none'")
        for name, value in headers:
            self.send_header(name, value)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(payload)

    def body(self):
        if self.headers.get("Transfer-Encoding") or len(self.headers.get_all("Content-Length", [])) > 1:
            raise ValueError("Unsupported request framing")
        length = int(self.headers.get("Content-Length", "0"))
        if not 0 <= length <= MAX_BODY:
            raise ValueError("Request too large")
        result = self.rfile.read(length)
        if len(result) != length:
            raise ValueError("Truncated request")
        return result

    def operator(self, path):
        gate = self.server.gate
        if self.command == "GET" and path == "/_operator":
            self.respond(200, OPERATOR_PAGE, "text/html; charset=utf-8")
            return
        if self.command != "POST" or self.headers.get("Origin") != gate.origin:
            self.respond(403, b'{"error":"operator_origin_required"}')
            return
        payload = self.body()
        if len(payload) > 8192:
            raise ValueError("Operator request too large")
        if path == "/_operator/session":
            content_type = self.headers.get("Content-Type", "").split(";")[0]
            if content_type == "application/json":
                decoded = json.loads(payload)
                if not isinstance(decoded, dict):
                    raise ValueError("Operator JSON must be an object")
                candidate = decoded.get("token", "")
            elif content_type == "application/x-www-form-urlencoded":
                candidate = parse_qs(payload.decode()).get("token", [""])[0]
            else:
                self.respond(415, b'{"error":"unsupported_content_type"}')
                return
            if not isinstance(candidate, str) or not hmac.compare_digest(candidate.encode(), gate.token):
                self.respond(403, b'{"error":"operator_denied"}')
                return
            self.respond(303, headers=[("Location", "/signup/setup"),
                         ("Set-Cookie", f"{COOKIE}={gate.session()}; Path=/; Max-Age={SESSION_SECONDS}; HttpOnly; Secure; SameSite=Strict")])
            return
        if not gate.authenticated(self.headers.get("Cookie")):
            self.respond(403, b'{"error":"operator_denied"}')
            return
        if path == "/_operator/activate":
            try:
                activated = gate.activate()
            except (OSError, sqlite3.Error):
                activated = False
            self.respond(200 if activated else 409,
                         b'{"activated":true}' if activated else b'{"error":"two_owner_passkeys_required"}')
        elif path == "/_operator/lock":
            gate.lock()
            self.respond(200, b'{"locked":true}')
        else:
            self.respond(404)

    def proxy(self):
        connection = http.client.HTTPConnection("127.0.0.1", 1411, timeout=15)
        try:
            body = self.body()
            connection_headers = {part.strip().lower() for part in self.headers.get("Connection", "").split(",")}
            excluded = HOP_HEADERS | connection_headers | {"host", "content-length", "forwarded", "x-real-ip"}
            headers = {name.lower(): value for name, value in self.headers.items()
                       if name.lower() not in excluded and not name.lower().startswith("x-forwarded-")}
            headers["Host"] = self.server.gate.host
            headers["X-Forwarded-Proto"] = "https"
            headers["X-Forwarded-Host"] = self.server.gate.host
            headers["X-Forwarded-For"] = self.client_address[0]
            if "cookie" in headers:
                headers["cookie"] = "; ".join(part.strip() for part in headers["cookie"].split(";")
                                               if part.strip().split("=", 1)[0] != COOKIE)
            connection.request(self.command, self.path, body=body, headers=headers)
            response = connection.getresponse()
            payload = response.read(MAX_BODY + 1)
            if len(payload) > MAX_BODY:
                self.respond(502, b'{"error":"upstream_response_too_large"}')
                return
            self.send_response(response.status)
            response_connection = {part.strip().lower() for part in response.getheader("Connection", "").split(",")}
            for name, value in response.getheaders():
                if name.lower() not in HOP_HEADERS | response_connection | {"content-length", "server", "date"}:
                    self.send_header(name, value)
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Strict-Transport-Security", "max-age=31536000")
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(payload)
        except (OSError, http.client.HTTPException):
            self.respond(502, b'{"error":"backend_unavailable"}')
        finally:
            connection.close()

    def dispatch(self):
        try:
            path = normalized_path(self.path)
            if path == "/healthz" and self.command in {"GET", "HEAD"}:
                connection = http.client.HTTPConnection("127.0.0.1", 1411, timeout=3)
                try:
                    connection.request("GET", "/healthz")
                    healthy = connection.getresponse().status == 204
                except (OSError, http.client.HTTPException):
                    healthy = False
                finally:
                    connection.close()
                self.respond(200 if healthy else 503, b'{"ready":true}' if healthy else b'{"ready":false}')
                return
            if self.headers.get("Host") != self.server.gate.host:
                self.respond(421, b'{"error":"canonical_host_required"}')
                return
            if path == "/_operator" or path.startswith("/_operator/"):
                self.operator(path)
                return
            active = self.server.gate.active()
            if active and (path == "/api/signup/setup" or path.startswith("/api/signup/setup/") or
                           path == "/signup/setup" or path.startswith("/signup/setup/")):
                self.respond(403, b'{"error":"initial_setup_disabled"}')
                return
            if not active and not self.server.gate.authenticated(self.headers.get("Cookie")):
                self.respond(403, b'{"error":"operator_gate_locked"}')
                return
            self.proxy()
        except (ValueError, TypeError, UnicodeError):
            self.respond(400, b'{"error":"invalid_request"}')
        except (OSError, sqlite3.Error):
            self.respond(503, b'{"error":"gate_unavailable"}')

    do_GET = dispatch
    do_HEAD = dispatch
    do_POST = dispatch
    do_PUT = dispatch
    do_PATCH = dispatch
    do_DELETE = dispatch
    do_OPTIONS = dispatch


class BoundedServer(ThreadingHTTPServer):
    daemon_threads = True
    slots = threading.BoundedSemaphore(64)

    def process_request(self, request, client_address):
        if not self.slots.acquire(blocking=False):
            self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except Exception:
            self.slots.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self.slots.release()


def main():
    port = int(os.environ.get("PORT", "8080"))
    if not 1024 <= port <= 65535 or port in {1411, 1414}:
        raise ValueError("PORT must be a nonprivileged port distinct from the backend and actor ports")
    gate = Gate(os.environ)
    gate.data.mkdir(parents=True, exist_ok=True)
    child_env = os.environ.copy()
    for name in ("ENCRYPTION_KEY_FILE", "DB_CONNECTION_STRING_FILE", "TRUSTED_PLATFORM", "PROXY_PROTOCOL",
                 "TLS_CERT", "TLS_KEY", "TLS_CERT_FILE", "TLS_KEY_FILE", "UNIX_SOCKET"):
        child_env.pop(name, None)
    child_env.update({"APP_ENV": "production", "PORT": "1411", "HOST": "127.0.0.1",
                      "ACTORS_HOST": "127.0.0.1", "ACTORS_PORT": "1414", "FRANCIS_HOST": "embedded",
                      "HA_ENABLED": "false", "SYSTEMD_SOCKET": "false", "TRUST_PROXY": "127.0.0.1/32",
                      "DB_CONNECTION_STRING": "/app/data/pocket-id.db", "UPLOAD_PATH": "/app/data/uploads",
                      "FILE_BACKEND": "filesystem", "UI_CONFIG_DISABLED": "true",
                      "ALLOW_INSECURE_CALLBACK_URLS": "false", "DISABLE_RATE_LIMITING": "false",
                      "ALLOW_DOWNGRADE": "false", "ANALYTICS_DISABLED": "true", "VERSION_CHECK_DISABLED": "true"})
    child_env.pop("GATE_ADMIN_TOKEN", None)
    child = subprocess.Popen(["/app/pocket-id"], env=child_env)
    server = BoundedServer(("0.0.0.0", port), Handler)
    server.gate = gate
    server.daemon_threads = True

    def stop(signum, frame):
        threading.Thread(target=server.shutdown, daemon=True).start()

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)

    def monitor():
        child.wait()
        server.shutdown()

    threading.Thread(target=monitor, daemon=True).start()
    print("Pocket Gate ready; backend loopback-only; public activation requires a persisted owner and two credentials", flush=True)
    try:
        server.serve_forever(poll_interval=0.2)
    finally:
        server.server_close()
        if child.poll() is None:
            child.terminate()
            try:
                child.wait(timeout=20)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait()
    return child.returncode if child.returncode not in {0, -signal.SIGTERM} else 0


if __name__ == "__main__":
    if sys.argv[1:] == ["healthcheck"]:
        connection = http.client.HTTPConnection("127.0.0.1", int(os.environ.get("PORT", "8080")), timeout=3)
        try:
            connection.request("GET", "/healthz")
            sys.exit(0 if connection.getresponse().status == 200 else 1)
        finally:
            connection.close()
    try:
        sys.exit(main())
    except (ValueError, OSError) as error:
        print(f"Startup refused: {error}", file=sys.stderr)
        sys.exit(1)
