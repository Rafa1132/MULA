"""Create a dedicated local Hermes home, matching backend credentials and the database settings."""

import os
from pathlib import Path
import secrets
import shutil


BACKEND = Path(__file__).resolve().parents[1]
RUNTIME_HOME = BACKEND.parent / ".runtime" / "hermes"
# PostgreSQL credentials for docker compose (repository root, git-ignored).
POSTGRES_ENV = BACKEND.parent / ".env.postgres"
DATABASE_NAME = "mula"


def write_private(path: Path, content: str) -> None:
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as file:
        file.write(content)


def native_postgres_available() -> bool:
    """A PostgreSQL installed on this machine (Homebrew, apt) is used directly, without Docker."""
    return shutil.which("pg_isready") is not None or shutil.which("psql") is not None


def database_settings() -> tuple[str, str | None]:
    """The backend's database URL and, for docker compose, the credentials file content.

    With a native PostgreSQL the URL uses the local server and the current OS user (no password:
    local connections are trusted by the default Homebrew setup). Otherwise a random password is
    generated for the compose service and the same password goes into the URL.
    """
    if native_postgres_available():
        return f"postgresql://localhost/{DATABASE_NAME}", None
    password = secrets.token_urlsafe(24)
    url = f"postgresql://{DATABASE_NAME}:{password}@127.0.0.1:5432/{DATABASE_NAME}"
    compose = f"POSTGRES_USER={DATABASE_NAME}\nPOSTGRES_PASSWORD={password}\nPOSTGRES_DB={DATABASE_NAME}\n"
    return url, compose


def main() -> None:
    backend_env = BACKEND / ".env.hermes"
    gateway_env = RUNTIME_HOME / ".env"
    config = RUNTIME_HOME / "config.yaml"
    if any(path.exists() for path in (backend_env, gateway_env, config, POSTGRES_ENV)):
        raise SystemExit(
            "Hermes configuration already exists. Existing files were preserved. "
            "See server/README.md to start or edit this profile."
        )
    RUNTIME_HOME.mkdir(parents=True, exist_ok=True, mode=0o700)
    key = secrets.token_urlsafe(32)
    # A separate secret for the opposite direction: the runtime calling the backend's agent tools.
    tools_key = secrets.token_urlsafe(32)
    # Each account's runtime profile key is derived from this seed (src/common/profiles.py).
    profile_seed = secrets.token_urlsafe(32)
    # Encrypts channel secrets at rest, such as a WhatsApp access token (src/common/secrets.py).
    secret_key = secrets.token_hex(32)
    database_url, compose_env = database_settings()
    # The model address the Hermes config reads as ${MULA_MODEL_BASE_URL}; local Ollama by default.
    model_url = os.getenv("MULA_MODEL_BASE_URL", "").strip() or "http://127.0.0.1:11434/v1"
    write_private(backend_env, (
        "HERMES_BASE_URL=http://127.0.0.1:8642\n"
        f"HERMES_API_KEY={key}\n"
        "HERMES_MODEL=hermes-agent\n"
        "HERMES_TIMEOUT_SECONDS=120\n"
        f"MULA_TOOLS_KEY={tools_key}\n"
        f"MULA_PROFILE_KEY_SEED={profile_seed}\n"
        f"MULA_SECRET_KEY={secret_key}\n"
        f"MULA_DATABASE_URL={database_url}\n"
    ))
    if compose_env is not None:
        write_private(POSTGRES_ENV, compose_env)
    write_private(gateway_env, (
        "API_SERVER_ENABLED=true\n"
        f"API_SERVER_KEY={key}\n"
        "API_SERVER_HOST=127.0.0.1\n"
        "API_SERVER_PORT=8642\n"
        f"MULA_TOOLS_KEY={tools_key}\n"
        f"MULA_MODEL_BASE_URL={model_url}\n"
    ))
    write_private(config, (BACKEND / "hermes" / "config.yaml").read_text(encoding="utf-8"))
    print("Created the private Hermes profile and server/.env.hermes; no credentials were printed.")
    if compose_env is None:
        print(f"Database: the local PostgreSQL, database '{DATABASE_NAME}'. Create it once with: createdb {DATABASE_NAME}")
    else:
        print("Database: docker compose (credentials in .env.postgres). ./run.sh starts it.")


if __name__ == "__main__":
    main()
