"""Local accounts, opaque sessions and account-owned conversation storage.

The tables (`accounts`, `sessions`, `messages`, `login_failures`) are defined by the Alembic
revisions under server/migrations; `database()` is the shared PostgreSQL transaction every
feature uses (see common/database.py).
"""
import hashlib
import hmac
import secrets
import time
from uuid import uuid4

from ...common import profiles
from ...common.database import UniqueViolation, database  # noqa: F401  (database is shared through this module)

from fastapi import Cookie, HTTPException

COOKIE = "mula_session"
SESSION_SECONDS = 7 * 24 * 60 * 60


def password_hash(password, salt):
    return hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1).hex()


def token_hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


def create_account(username, password):
    salt = secrets.token_hex(16)
    digest = password_hash(password, salt)
    account_id = str(uuid4())
    try:
        with database() as db:
            db.execute("INSERT INTO accounts (id, username, salt, password_hash, conversation_id) VALUES (%s, %s, %s, %s, %s)",
                       (account_id, username, salt, digest, str(uuid4())))
    except UniqueViolation as error:
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
        db.execute("DELETE FROM login_failures WHERE occurred < %s", (now - 900,))
        attempts = db.execute("SELECT count(*) AS attempts FROM login_failures WHERE username = %s", (username,)).fetchone()["attempts"]
        if attempts >= 5:
            raise HTTPException(429, "Too many attempts. Try again in 15 minutes.")
        account = db.execute("SELECT * FROM accounts WHERE username = %s", (username,)).fetchone()
    salt = "00" * 16
    expected = "00" * 64
    if account:
        salt = account["salt"]
        expected = account["password_hash"]
    valid = hmac.compare_digest(password_hash(password, salt), expected)
    if not valid or account is None:
        with database() as db:
            db.execute("INSERT INTO login_failures (username, occurred) VALUES (%s, %s)", (username, now))
        raise HTTPException(401, "Incorrect username or password.")
    token = secrets.token_urlsafe(32)
    with database() as db:
        db.execute("DELETE FROM sessions WHERE expires <= %s", (now,))
        db.execute("DELETE FROM login_failures WHERE username = %s", (username,))
        db.execute("INSERT INTO sessions (token_hash, account_id, expires) VALUES (%s, %s, %s)",
                   (token_hash(token), account["id"], now + SESSION_SECONDS))
    return token, public_account(account)


def public_account(account):
    return {"id": account["id"], "username": account["username"], "conversation_id": account["conversation_id"]}


def current_account(mula_session: str | None = Cookie(default=None)):
    if not mula_session or len(mula_session) > 128:
        raise HTTPException(401, "Please sign in.")
    with database() as db:
        account = db.execute('''SELECT accounts.* FROM accounts JOIN sessions
            ON accounts.id = sessions.account_id WHERE sessions.token_hash = %s AND sessions.expires > %s''',
            (token_hash(mula_session), int(time.time()))).fetchone()
    if account is None:
        raise HTTPException(401, "Please sign in.")
    return public_account(account)


def logout(token):
    if token and len(token) <= 128:
        with database() as db:
            db.execute("DELETE FROM sessions WHERE token_hash = %s", (token_hash(token),))


def add_message(account_id, role, text, note=None, agent_id="operator"):
    with database() as db:
        row = db.execute("INSERT INTO messages (account_id, role, text, note, agent_id) VALUES (%s, %s, %s, %s, %s) RETURNING id",
                         (account_id, role, text, note, agent_id)).fetchone()
        return row["id"]


def save_reply(message_id, text, note):
    with database() as db:
        db.execute("UPDATE messages SET text = %s, note = %s WHERE id = %s", (text, note, message_id))


def history(account_id, agent_id="operator"):
    with database() as db:
        rows = db.execute("SELECT id, role, text, note FROM messages WHERE account_id = %s AND agent_id = %s ORDER BY id", (account_id, agent_id)).fetchall()
    return [dict(row) for row in rows]
