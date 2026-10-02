import http.client
import json
import os
import sys
from http.cookies import SimpleCookie
from urllib.parse import urlsplit


base = urlsplit(sys.argv[1])
origin = os.environ["APP_URL"]
canonical = urlsplit(origin)
if base.scheme == "http":
    if base.hostname not in {"127.0.0.1", "localhost", "::1"} or base.port not in range(18400, 18405):
        raise SystemExit("Plain HTTP smoke is restricted to loopback ports 18400–18404")
elif base.scheme != "https":
    raise SystemExit("HTTPS required outside isolated loopback smoke")


def request(path, method="GET", body=None, extra=None, host=None):
    client_class = http.client.HTTPSConnection if base.scheme == "https" else http.client.HTTPConnection
    connection = client_class(base.hostname, base.port, timeout=8)
    headers = {"Host": host or canonical.netloc}
    if extra:
        headers.update(extra)
    if body is not None:
        body = json.dumps(body)
        headers["Content-Type"] = "application/json"
    try:
        connection.request(method, path, body, headers)
        response = connection.getresponse()
        return response.status, dict(response.getheaders()), response.read()
    finally:
        connection.close()


assert request("/healthz")[0] == 200, "Gateway/backend unhealthy"
for path in ["/", "/signup/setup", "/api/signup/setup", "/api/signup/%73etup/",
             "/.well-known/openid-configuration", "/api/users", "/authorize"]:
    assert request(path)[0] == 403, f"Anonymous route not gated: {path}"
assert request("/api/signup/setup", "POST", {"username": "outsider"})[0] == 403
assert request("/api/signup/setup", extra={"X-Forwarded-For": "127.0.0.1", "X-Forwarded-Proto": "https",
                                          "Authorization": "Bearer outsider"})[0] == 403
assert request("/api/%252f/signup/setup")[0] == 400
assert request("/api/../signup/setup")[0] == 400
assert request("/_operator/session", "POST", {"token": "wrong"}, {"Origin": origin})[0] == 403
assert request("/_operator/session", "POST", {"token": "wrong"}, {"Origin": "https://attacker.invalid"})[0] == 403
assert request("/_operator/activate", "POST", {}, {"Origin": origin})[0] == 403
assert request("/_operator/lock", "POST", {}, {"Origin": origin})[0] == 403
assert request("/", host="attacker.invalid")[0] == 421
assert request("/_operator")[0] == 200
print("PASS: readiness; all first-claim routes, spoofed proxy headers, management and bad origins denied")

token = os.environ.get("GATE_ADMIN_TOKEN")
if token:
    status, headers, _ = request("/_operator/session", "POST", {"token": token}, {"Origin": origin})
    assert status == 303
    cookie = headers["Set-Cookie"]
    assert all(flag in cookie for flag in ["HttpOnly", "Secure", "SameSite=Strict", "Path=/", "Max-Age=900"])
    cookies = SimpleCookie(cookie)
    session = {"Cookie": "__Host-pocket-gate=" + cookies["__Host-pocket-gate"].value}
    assert request("/api/signup/setup", extra=session)[0] == 204, "Requires empty fixture DB; never claims owner"
    status, _, payload = request("/.well-known/openid-configuration", extra=session)
    assert status == 200
    discovery = json.loads(payload)
    assert discovery["issuer"] == origin
    assert "S256" in discovery["code_challenge_methods_supported"]
    assert request("/api/users", extra=session)[0] in {401, 403}, "Gate token must not grant Pocket ID admin"
    status, _, payload = request("/_operator/activate", "POST", {}, session | {"Origin": origin})
    assert status == 409, "Activation without two real owner credentials must fail"
    print("PASS: operator cookie isolation; real upstream discovery/PKCE metadata; admin API denied; premature activation denied")
print("NOT RUN: HTTPS browser owner/passkeys, registered-client PKCE callback/recovery; no owner created")
