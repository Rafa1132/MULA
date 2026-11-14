import math
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
