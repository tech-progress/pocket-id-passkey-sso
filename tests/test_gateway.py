import json
import io
import os
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path
from email.message import Message
from types import SimpleNamespace
from unittest.mock import Mock, patch

from gateway import COOKIE, Gate, Handler, normalized_path


class GateTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.data = Path(self.temporary.name)
        self.env = {"APP_URL": "https://id.example.com", "ENCRYPTION_KEY": "encryption-" + "a" * 40,
                    "GATE_ADMIN_TOKEN": "operator-" + "b" * 40, "GATE_FORCE_LOCK": "false"}
        self.gate = Gate(self.env, self.data)

    def fixture(self, credentials=2):
        with closing(sqlite3.connect(self.gate.database)) as database, database:
            database.executescript("CREATE TABLE users(id TEXT PRIMARY KEY, is_admin INTEGER, disabled INTEGER);"
                                   "CREATE TABLE webauthn_credentials(user_id TEXT, public_key BLOB, credential_id BLOB);"
                                   "INSERT INTO users VALUES('fixture-owner',1,0);")
            for index in range(credentials):
                database.execute("INSERT INTO webauthn_credentials VALUES(?,?,?)",
                                 ("fixture-owner", b"unit-test-only-key", str(index).encode()))

    def test_missing_invalid_configuration(self):
        for name, value in [("APP_URL", "http://id.example.com"), ("APP_URL", "https://id.example.com/"),
                            ("APP_URL", "https://user@id.example.com"), ("ENCRYPTION_KEY", ""),
                            ("GATE_ADMIN_TOKEN", ""), ("GATE_FORCE_LOCK", "yes"), ("STATIC_API_KEY", "key")]:
            with self.subTest(name=name, value=value), self.assertRaises(ValueError):
                Gate(self.env | {name: value}, self.data)

    def test_missing_corrupt_state_and_missing_database_fail_closed(self):
        self.assertFalse(self.gate.active())
        self.gate.state.write_text("not json")
        self.assertFalse(self.gate.active())
        with self.assertRaises(sqlite3.Error):
            self.gate.activate()
        self.assertFalse(self.gate.database.exists())

    def test_activation_requires_two_credentials(self):
        self.fixture(credentials=1)
        self.assertFalse(self.gate.activate())
        self.assertFalse(self.gate.active())

    def test_owner_probe_closes_its_readonly_connection(self):
        self.fixture()
        database = sqlite3.connect(self.gate.database)
        self.addCleanup(database.close)
        with patch("gateway.sqlite3.connect", return_value=database):
            self.assertEqual(self.gate.enrolled_owner(), "fixture-owner")
        with self.assertRaises(sqlite3.ProgrammingError):
            database.execute("SELECT 1")

    def test_activation_persistence_origin_key_and_owner_binding(self):
        self.fixture()
        self.assertTrue(self.gate.activate())
        self.assertEqual(os.stat(self.gate.state).st_mode & 0o777, 0o600)
        self.assertTrue(Gate(self.env, self.data).active())
        for name, value in [("APP_URL", "https://other.example.com"), ("ENCRYPTION_KEY", "x" * 40),
                            ("GATE_FORCE_LOCK", "true")]:
            self.assertFalse(Gate(self.env | {name: value}, self.data).active())
        with closing(sqlite3.connect(self.gate.database)) as database, database:
            database.execute("DELETE FROM webauthn_credentials")
        self.assertFalse(self.gate.active())

    def test_tampering_and_lock(self):
        self.fixture()
        self.gate.activate()
        envelope = json.loads(self.gate.state.read_text())
        envelope["payload"] += " "
        self.gate.state.write_text(json.dumps(envelope))
        self.assertFalse(self.gate.active())
        self.gate.lock()
        self.assertFalse(self.gate.state.exists())

    def test_cookie_expiry_forgery_origin_and_rotation(self):
        with patch("gateway.time.time", return_value=1000):
            cookie = f"{COOKIE}={self.gate.session()}"
            self.assertTrue(self.gate.authenticated(cookie))
            self.assertFalse(self.gate.authenticated(cookie + "forged"))
            self.assertFalse(Gate(self.env | {"GATE_ADMIN_TOKEN": "x" * 40}, self.data).authenticated(cookie))
            self.assertFalse(Gate(self.env | {"APP_URL": "https://other.example.com"}, self.data).authenticated(cookie))
        with patch("gateway.time.time", return_value=2000):
            self.assertFalse(self.gate.authenticated(cookie))

    def test_encoded_and_ambiguous_paths(self):
        self.assertEqual(normalized_path("/api/signup/%73etup/"), "/api/signup/setup")
        for value in ["/api/../signup/setup", "/api/%252fsetup", "/api//setup", "/api/%00setup",
                      "https://other.example.com/api/signup/setup", "/api/%5csetup"]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                normalized_path(value)

    def test_disabled_owner_locks_existing_activation(self):
        self.fixture()
        self.gate.activate()
        with closing(sqlite3.connect(self.gate.database)) as database, database:
            database.execute("UPDATE users SET disabled=1")
        self.assertFalse(self.gate.active())

    def test_active_route_permanently_denies_encoded_first_claim(self):
        self.fixture()
        self.gate.activate()
        handler = Handler.__new__(Handler)
        handler.server = SimpleNamespace(gate=self.gate)
        handler.headers = Message()
        handler.headers["Host"] = self.gate.host
        handler.path = "/api/signup/%73etup/"
        handler.command = "POST"
        handler.respond = Mock()
        handler.proxy = Mock()
        handler.dispatch()
        self.assertEqual(handler.respond.call_args.args[0], 403)
        handler.proxy.assert_not_called()
        handler.respond.reset_mock()
        handler.path = "/.well-known/openid-configuration"
        handler.command = "GET"
        handler.dispatch()
        handler.proxy.assert_called_once()

    def test_lowercase_operator_cookie_and_forwarding_headers_not_forwarded(self):
        handler = Handler.__new__(Handler)
        handler.server = SimpleNamespace(gate=self.gate)
        handler.headers = Message()
        handler.headers["cookie"] = f"{COOKIE}=sensitive-operator-cookie; app=retained"
        handler.headers["X-Forwarded-For"] = "127.0.0.1"
        handler.headers["Forwarded"] = "for=127.0.0.1"
        handler.headers["Authorization"] = "Bearer application-credential"
        handler.client_address = ("203.0.113.4", 10000)
        handler.command = "GET"
        handler.path = "/api/users"
        handler.body = Mock(return_value=b"")
        handler.send_response = Mock()
        handler.send_header = Mock()
        handler.end_headers = Mock()
        handler.wfile = io.BytesIO()
        connection = Mock()
        response = connection.getresponse.return_value
        response.status = 401
        response.getheaders.return_value = []
        response.getheader.return_value = ""
        response.read.return_value = b"{}"
        with patch("gateway.http.client.HTTPConnection", return_value=connection):
            handler.proxy()
        forwarded = connection.request.call_args.kwargs["headers"]
        self.assertEqual(forwarded["cookie"], "app=retained")
        self.assertEqual(forwarded["authorization"], "Bearer application-credential")
        self.assertEqual(forwarded["X-Forwarded-For"], "203.0.113.4")
        self.assertNotIn("forwarded", forwarded)


if __name__ == "__main__":
    unittest.main()
