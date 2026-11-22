"""The spoken welcome: fixed text, so its audio is made once and reused for every new account.

The file is `<data dir>/speech/welcome-<key>.wav` (`.mp3` with OpenRouter), where the key is a hash of the provider and the
text. Changing either makes a new file on the next request (or with
server/scripts/generate_welcome_audio.py at deploy time); old files are simply never read again.
"""
import asyncio
import hashlib
import os
from pathlib import Path
import tempfile

from fastapi import HTTPException

from ..memory import store
from . import service as speech

# One generation at a time, so new accounts arriving together don't each synthesise it.
_generation_lock = asyncio.Lock()


def welcome_path(text: str) -> Path:
    key = hashlib.sha256(f"{speech.provider_key()}\n{text}".encode("utf-8")).hexdigest()[:16]
    return store.DATA_DIR / "speech" / f"welcome-{key}.{speech.file_extension()}"


def write_private(path: Path, audio: bytes) -> None:
    """Atomically, owner-only, never through a symbolic link."""
    folder = path.parent
    if folder.is_symlink() or path.is_symlink():
        raise HTTPException(409, "The speech folder must not be a symbolic link.")
    folder.mkdir(mode=0o700, parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix=".welcome-", dir=folder)
    try:
        with os.fdopen(descriptor, "wb") as output:
            output.write(audio)
            output.flush()
            os.fsync(output.fileno())
        os.chmod(temporary, 0o600)
        os.replace(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)


async def welcome_audio(text: str) -> bytes:
    """The welcome's audio, made on first use and read from disk afterwards."""
    path = welcome_path(text)
    if path.is_file() and not path.is_symlink():
        return path.read_bytes()
    async with _generation_lock:
        # Another request may have made it while this one waited.
        if path.is_file() and not path.is_symlink():
            return path.read_bytes()
        audio = await speech.synthesize(text)
        try:
            write_private(path, audio)
        except OSError:
            # Serving it still works; it is simply made again next time.
            pass
        return audio
