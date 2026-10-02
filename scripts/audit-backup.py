import hashlib
import json
import os
import sqlite3
import sys
from pathlib import Path


root = Path(sys.argv[1])
with sqlite3.connect(f"file:{root}/pocket-id.db?mode=ro", uri=True) as database:
    if database.execute("PRAGMA quick_check").fetchone()[0] != "ok":
        raise SystemExit("SQLite integrity check failed")
    users = database.execute("SELECT count(*) FROM users WHERE id != ?",
                             ("00000000-0000-0000-0000-000000000000",)).fetchone()[0]
    credentials = database.execute("SELECT count(*) FROM webauthn_credentials").fetchone()[0]
    key_rows = database.execute("SELECT * FROM kv ORDER BY key").fetchall()
key = os.environ.get("ENCRYPTION_KEY", "")
if len(key) < 32:
    raise SystemExit("Supply the original ENCRYPTION_KEY privately, never on the command line")
print(json.dumps({"integrity": "ok", "users": users, "credentials": credentials,
                  "origin": os.environ["APP_URL"], "encryption_key_sha256": hashlib.sha256(key.encode()).hexdigest(),
                  "kv_sha256": hashlib.sha256(repr(key_rows).encode()).hexdigest()}, sort_keys=True))
