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
if MULA_RELAXED_AUTH and SECURE_COOKIES:
    # Secure cookies mean a real deployment; the testing shortcut must never reach one.
    raise ValueError("MULA_RELAXED_AUTH is for local development and cannot be used with LARAS_SECURE_COOKIES=true.")
