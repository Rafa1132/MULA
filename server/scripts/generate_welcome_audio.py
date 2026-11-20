"""Make the spoken welcome's audio once, ahead of the first new account (for example at deploy).

Run with the backend environment:
    server/.venv/bin/python server/scripts/generate_welcome_audio.py

It uses the same provider as /api/speech (MULA_SPEECH_PROVIDER, from the environment or
server/.env.hermes) and writes `<data dir>/speech/welcome-<key>.wav`. Without it, the backend makes
the file on the first request instead; either way it is made once, not per account.
"""
import asyncio
import os
from pathlib import Path
import sys

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))


def load_backend_env() -> None:
    """The settings this script needs, from server/.env.hermes, unless the environment has them."""
    env_file = BACKEND / ".env.hermes"
    if not env_file.is_file():
        return
    for line in env_file.read_text(encoding="utf-8").splitlines():
        name, separator, value = line.partition("=")
        if separator and name.strip() in {"MULA_SPEECH_PROVIDER", "MULA_DATA_DIR"}:
            os.environ.setdefault(name.strip(), value.strip())


def main() -> None:
    load_backend_env()
    from fastapi import HTTPException
    from src.features.orchestrator import onboarding
    from src.features.voice import welcome

    try:
        asyncio.run(welcome.welcome_audio(onboarding.WELCOME))
    except HTTPException as error:
        raise SystemExit(f"The welcome audio was not made: {error.detail}") from error
    print(f"Welcome audio is ready at {welcome.welcome_path(onboarding.WELCOME)}.")


if __name__ == "__main__":
    main()
