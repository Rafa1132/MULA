"""Encryption at rest for channel secrets (a WhatsApp access token, app secret, verify token).

AES-256-GCM with the key in MULA_SECRET_KEY. Each value gets a fresh 12-byte nonce, stored in front
of the ciphertext. The `purpose` is bound as associated data, so a ciphertext copied into another
column (for example an app secret into the access token's place) fails to decrypt instead of being
used for the wrong thing. Plain values are never logged or returned by an API.
"""
import os

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi import HTTPException

from . import config

NONCE_BYTES = 12


class SecretUnavailable(Exception):
    """A stored secret can't be decrypted (the key changed, or the value was tampered with)."""


def _cipher() -> AESGCM:
    if not config.MULA_SECRET_KEY:
        raise HTTPException(503, "Channels need MULA_SECRET_KEY on the server first: add one made with `openssl rand -hex 32` to server/.env.hermes and restart.")
    return AESGCM(bytes.fromhex(config.MULA_SECRET_KEY))


def configured() -> bool:
    return bool(config.MULA_SECRET_KEY)


def encrypt(value: str, purpose: str) -> bytes:
    nonce = os.urandom(NONCE_BYTES)
    return nonce + _cipher().encrypt(nonce, value.encode("utf-8"), purpose.encode("utf-8"))


def decrypt(blob: bytes, purpose: str) -> str:
    blob = bytes(blob)
    if len(blob) <= NONCE_BYTES:
        raise SecretUnavailable("The stored secret is malformed.")
    try:
        plain = _cipher().decrypt(blob[:NONCE_BYTES], blob[NONCE_BYTES:], purpose.encode("utf-8"))
    except InvalidTag as error:
        raise SecretUnavailable("The stored secret can't be read with this server's MULA_SECRET_KEY.") from error
    return plain.decode("utf-8")
