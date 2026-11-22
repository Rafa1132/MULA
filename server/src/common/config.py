import math
import re
import os
from urllib.parse import urlsplit


HERMES_BASE_URL = os.getenv("HERMES_BASE_URL", "http://127.0.0.1:8642").rstrip("/")
HERMES_API_KEY = os.getenv("HERMES_API_KEY", "").strip()
HERMES_MODEL = os.getenv("HERMES_MODEL", "hermes-agent").strip()
HERMES_TIMEOUT_SECONDS = float(os.getenv("HERMES_TIMEOUT_SECONDS", "120"))
# Shared secret the Mula runtime sends to this backend's /mcp tool server.
# Empty means agent tools are not connected and /mcp refuses every request.
MULA_TOOLS_KEY = os.getenv("MULA_TOOLS_KEY", "").strip()
# Seed for each account's runtime profile key (see common/profiles.py). Empty means
# accounts get no profile of their own, and every agent turn is refused until setup.
MULA_PROFILE_KEY_SEED = os.getenv("MULA_PROFILE_KEY_SEED", "").strip()
# The runtime home that holds the root profile and, under profiles/, one profile per account.
HERMES_HOME = os.getenv("HERMES_HOME", "").strip()
# The runtime's command-line launcher, which the Board feature runs for `hermes kanban`. Empty means
# the install's own path, <repo>/.runtime/hermes-source/.hermes/bin/hermes (also /app/... in Docker).
MULA_HERMES_BIN = os.getenv("MULA_HERMES_BIN", "").strip()
# The application database (accounts, sessions, chat history, agent settings, forecast runs,
# tool tickets, agent requests). Empty means the backend refuses to start; see common/database.py.
MULA_DATABASE_URL = os.getenv("MULA_DATABASE_URL", "").strip()
# Schema inside that database; tests and rehearsals use one of their own.
MULA_DATABASE_SCHEMA = os.getenv("MULA_DATABASE_SCHEMA", "public").strip() or "public"
# Where per-account files live (the memory stores under workspaces/). Not the database.
MULA_DATA_DIR = os.getenv("MULA_DATA_DIR", "").strip()
# Development only: accept any non-empty username and password at sign-up and sign-in, for
# testing. Passwords are still hashed and sessions work as usual. Off unless set to "true";
# the dev launcher (scripts/run.py) turns it on, nothing else does.
MULA_RELAXED_AUTH = os.getenv("MULA_RELAXED_AUTH", "").strip().lower() == "true"
# Which engine makes AI voice behind /api/speech: "say" (macOS only, the default), "openrouter"
# (OpenRouter's text-to-speech with the OPENROUTER_API_KEY the brains use; paid per character, for a
# Linux server) or "off" (voice is refused with a clear message; chat and captions still work).
# See server/src/features/voice/README.md.
MULA_SPEECH_PROVIDER = os.getenv("MULA_SPEECH_PROVIDER", "say").strip().lower() or "say"
# The OpenRouter speech model and voice. Kokoro is open-weight and among the cheapest there; its
# voices are listed at https://openrouter.ai/api/v1/audio/speech/models/hexgrad/kokoro-82m.
MULA_SPEECH_MODEL = os.getenv("MULA_SPEECH_MODEL", "hexgrad/kokoro-82m").strip() or "hexgrad/kokoro-82m"
MULA_SPEECH_VOICE = os.getenv("MULA_SPEECH_VOICE", "af_heart").strip() or "af_heart"
# When set, sign-up needs this code (the server is reachable from the internet; see
# docker/README.md). Shared privately with the people who may make an account; empty means anyone
# who reaches the server can sign up, which is fine behind an SSH tunnel or on this Mac.
MULA_INVITE_CODE = os.getenv("MULA_INVITE_CODE", "").strip()
# The key that encrypts channel secrets at rest (common/secrets.py), such as a WhatsApp access
# token: 64 hex characters (32 bytes), made with `openssl rand -hex 32`. Empty means channels can't
# be connected. Never commit it; losing it means reconnecting every channel.
MULA_SECRET_KEY = os.getenv("MULA_SECRET_KEY", "").strip()
# This server's public HTTPS address, shown to the owner as the base of the WhatsApp webhook URL
# (for example https://203-0-113-10.sslip.io). Empty on a Mac without a public address.
MULA_PUBLIC_URL = os.getenv("MULA_PUBLIC_URL", "").strip().rstrip("/")
# The Meta Graph API version for WhatsApp calls (features/channels/whatsapp/graph.py).
MULA_WHATSAPP_GRAPH_VERSION = os.getenv("MULA_WHATSAPP_GRAPH_VERSION", "v23.0").strip() or "v23.0"
# Set when serving through HTTPS, which is how Mula runs in production.
SECURE_COOKIES = os.getenv("LARAS_SECURE_COOKIES") == "true"

url = urlsplit(HERMES_BASE_URL)
if (
    url.scheme not in {"http", "https"}
    or not url.hostname
    or url.username
    or url.password
    or url.query
    or url.fragment
):
    raise ValueError("HERMES_BASE_URL must be an HTTP(S) URL without credentials or query parameters.")
if not HERMES_MODEL:
    raise ValueError("HERMES_MODEL must not be empty.")
if not math.isfinite(HERMES_TIMEOUT_SECONDS) or HERMES_TIMEOUT_SECONDS <= 0:
    raise ValueError("HERMES_TIMEOUT_SECONDS must be a positive finite number.")
if MULA_SPEECH_PROVIDER not in {"say", "openrouter", "off"}:
    raise ValueError("MULA_SPEECH_PROVIDER must be \"say\", \"openrouter\" or \"off\".")
# Both go into a JSON request body and a cache file name, so keep them to plain identifiers.
if not re.fullmatch(r"[a-z0-9][a-z0-9._-]*/[a-z0-9][a-z0-9._:-]*", MULA_SPEECH_MODEL):
    raise ValueError("MULA_SPEECH_MODEL must look like author/model, for example hexgrad/kokoro-82m.")
if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_:.-]{0,63}", MULA_SPEECH_VOICE):
    raise ValueError("MULA_SPEECH_VOICE must be a voice ID such as af_heart.")
if MULA_INVITE_CODE and len(MULA_INVITE_CODE) < 16:
    # Short codes can be guessed; sign-up has no per-attempt limit of its own.
    raise ValueError("MULA_INVITE_CODE must be at least 16 characters; make one with: openssl rand -hex 16")
if MULA_SECRET_KEY and not re.fullmatch(r"[0-9a-fA-F]{64}", MULA_SECRET_KEY):
    raise ValueError("MULA_SECRET_KEY must be 64 hex characters; make one with: openssl rand -hex 32")
if MULA_PUBLIC_URL and not re.fullmatch(r"https://[A-Za-z0-9.-]+(:[0-9]+)?", MULA_PUBLIC_URL):
    raise ValueError("MULA_PUBLIC_URL must be https://<host>, with no path.")
if not re.fullmatch(r"v[0-9]{1,2}\.[0-9]", MULA_WHATSAPP_GRAPH_VERSION):
    raise ValueError("MULA_WHATSAPP_GRAPH_VERSION must look like v23.0.")
if MULA_RELAXED_AUTH and SECURE_COOKIES:
    # Secure cookies mean a real deployment; the testing shortcut must never reach one.
    raise ValueError("MULA_RELAXED_AUTH is for local development and cannot be used with LARAS_SECURE_COOKIES=true.")
