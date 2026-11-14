"""Local accounts, opaque sessions and account-owned conversation storage."""
from contextlib import contextmanager
import hashlib
import hmac
import os
from pathlib import Path
import secrets
import sqlite3
import time
from uuid import uuid4

from ...common import profiles
from ...common.paths import PROJECT_ROOT

from fastapi import Cookie, HTTPException

DB_PATH = Path(os.getenv("LARAS_ACCOUNT_DB", str(PROJECT_ROOT / ".runtime/accounts.sqlite3")))
COOKIE = "mula_session"
SESSION_SECONDS = 7 * 24 * 60 * 60


@contextmanager
def database():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    connection = sqlite3.connect(DB_PATH, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.executescript('''
        CREATE TABLE IF NOT EXISTS accounts (
            id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL,
            salt TEXT NOT NULL, password_hash TEXT NOT NULL,
            conversation_id TEXT UNIQUE NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sessions (
            token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id),
            expires INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id),
            role TEXT NOT NULL, text TEXT NOT NULL, note TEXT
        );
        CREATE TABLE IF NOT EXISTS login_failures (
            username TEXT NOT NULL, occurred INTEGER NOT NULL
        );
    ''')
    add_message_agent_column(connection)
    os.chmod(DB_PATH, 0o600)
    try:
        with connection:
            yield connection
    finally:
        connection.close()


def add_message_agent_column(connection):
    """Older databases hold only Operator messages; tag them so each agent has its own history."""
    if has_message_agent_column(connection):
        return
    try:
        connection.execute("ALTER TABLE messages ADD COLUMN agent_id TEXT NOT NULL DEFAULT 'operator'")
    except sqlite3.OperationalError:
        # A concurrent connection may have added it first; anything else is a real failure.
        if not has_message_agent_column(connection):
            raise


def has_message_agent_column(connection):
    return any(row["name"] == "agent_id" for row in connection.execute("PRAGMA table_info(messages)"))


def password_hash(password, salt):
    return hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1).hex()


def token_hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


def create_account(username, password):
    salt = secrets.token_hex(16)
    digest = password_hash(password, salt)
    account_id = str(uuid4())
    with database() as db:
        try:
            db.execute("INSERT INTO accounts VALUES (?, ?, ?, ?, ?)",
                       (account_id, username, salt, digest, str(uuid4())))
        except sqlite3.IntegrityError as error:
            raise HTTPException(409, "That username is already taken.") from error
    provision_profile(account_id)
    return authenticate(username, password)


def provision_profile(account_id):
    """Each account gets its own runtime profile, so no runtime state is ever shared."""
    if not profiles.configured():
        # Without the seed there is nothing to derive a key from; every agent turn says so.
        return
    try:
        profiles.ensure_profile(account_id)
    except profiles.ProfileError as error:
        raise HTTPException(503, str(error)) from error
    # The gateway finds new profile folders on a 30-second rescan; asking now makes the first turn work.
    profiles.announce_profile(account_id)


def authenticate(username, password):
    now = int(time.time())
    with database() as db:
        db.execute("DELETE FROM login_failures WHERE occurred < ?", (now - 900,))
        attempts = db.execute("SELECT count(*) FROM login_failures WHERE username = ?", (username,)).fetchone()[0]
        if attempts >= 5:
            raise HTTPException(429, "Too many attempts. Try again in 15 minutes.")
        account = db.execute("SELECT * FROM accounts WHERE username = ?", (username,)).fetchone()
    salt = "00" * 16
    expected = "00" * 64
    if account:
        salt = account["salt"]
        expected = account["password_hash"]
    valid = hmac.compare_digest(password_hash(password, salt), expected)
    if not valid or account is None:
        with database() as db:
            db.execute("INSERT INTO login_failures VALUES (?, ?)", (username, now))
        raise HTTPException(401, "Incorrect username or password.")
    token = secrets.token_urlsafe(32)
    with database() as db:
        db.execute("DELETE FROM sessions WHERE expires <= ?", (now,))
        db.execute("DELETE FROM login_failures WHERE username = ?", (username,))
        db.execute("INSERT INTO sessions VALUES (?, ?, ?)", (token_hash(token), account["id"], now + SESSION_SECONDS))
    return token, public_account(account)


def public_account(account):
    return {"id": account["id"], "username": account["username"], "conversation_id": account["conversation_id"]}


def current_account(mula_session: str | None = Cookie(default=None)):
    if not mula_session or len(mula_session) > 128:
        raise HTTPException(401, "Please sign in.")
    with database() as db:
        account = db.execute('''SELECT accounts.* FROM accounts JOIN sessions
            ON accounts.id = sessions.account_id WHERE token_hash = ? AND expires > ?''',
            (token_hash(mula_session), int(time.time()))).fetchone()
    if account is None:
        raise HTTPException(401, "Please sign in.")
    return public_account(account)


def logout(token):
    if token and len(token) <= 128:
        with database() as db:
            db.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash(token),))


def add_message(account_id, role, text, note=None, agent_id="operator"):
    with database() as db:
        cursor = db.execute("INSERT INTO messages (account_id, role, text, note, agent_id) VALUES (?, ?, ?, ?, ?)",
                            (account_id, role, text, note, agent_id))
        return cursor.lastrowid


def save_reply(message_id, text, note):
    with database() as db:
        db.execute("UPDATE messages SET text = ?, note = ? WHERE id = ?", (text, note, message_id))


def history(account_id, agent_id="operator"):
    with database() as db:
        rows = db.execute("SELECT id, role, text, note FROM messages WHERE account_id = ? AND agent_id = ? ORDER BY id", (account_id, agent_id)).fetchall()
    return [dict(row) for row in rows]
