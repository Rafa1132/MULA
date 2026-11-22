"""AI voice for /api/speech. `MULA_SPEECH_PROVIDER` picks the engine:

- `say`: macOS's built-in voice, local, with no external service or API key (WAV);
- `openrouter`: OpenRouter's text-to-speech (Kokoro by default) with the OPENROUTER_API_KEY the
  brains already use, for a backend on Linux; paid per character (MP3);
- `off`: voice is refused with a clear message.

Chat and captions work either way. Error messages never contain the spoken text or the key."""

import asyncio
import os
from pathlib import Path
import sys
import tempfile

from fastapi import HTTPException
import httpx

from ...common import config, profiles

OPENROUTER_SPEECH_URL = "https://openrouter.ai/api/v1/audio/speech"
OPENROUTER_TIMEOUT_SECONDS = 30
MAX_AUDIO_BYTES = 16_000_000


# One bounded synthesis job per process. Reject excess work rather than building
# an unbounded queue behind the model on a developer's machine.
_synthesis_lock = asyncio.Lock()


def provider_key() -> str:
    """Names the engine and voice, so audio made once (the welcome) is made again when they change."""
    if config.MULA_SPEECH_PROVIDER == "openrouter":
        return f"openrouter:{config.MULA_SPEECH_MODEL}:{config.MULA_SPEECH_VOICE}"
    return config.MULA_SPEECH_PROVIDER


def media_type() -> str:
    """The audio type synthesize() returns: MP3 from OpenRouter, WAV from `say`."""
    if config.MULA_SPEECH_PROVIDER == "openrouter":
        return "audio/mpeg"
    return "audio/wav"


def file_extension() -> str:
    if media_type() == "audio/mpeg":
        return "mp3"
    return "wav"


async def synthesize(text: str) -> bytes:
    if config.MULA_SPEECH_PROVIDER == "off":
        raise HTTPException(503, "AI voice is switched off on this server. Chat still works.")
    if config.MULA_SPEECH_PROVIDER == "openrouter":
        return await synthesize_openrouter(text)
    return await synthesize_say(text)


async def synthesize_say(text: str) -> bytes:
    if sys.platform != "darwin":
        raise HTTPException(503, "AI voice currently needs the Mula backend to run on macOS. Chat still works.")
    if _synthesis_lock.locked():
        raise HTTPException(429, "Voice is busy. Try playing the reply again in a moment.")

    async with _synthesis_lock:
        with tempfile.TemporaryDirectory(prefix="mula-speech-") as directory:
            source = Path(directory) / "input.txt"
            output = Path(directory) / "speech.wav"
            # A private input file avoids putting conversation text in process
            # arguments. No shell is used and client text cannot supply flags.
            source.write_text(text, encoding="utf-8")
            process = None
            try:
                process = await asyncio.create_subprocess_exec(
                    "/usr/bin/say", "-f", str(source), "-o", str(output),
                    "--file-format=WAVE", "--data-format=LEI16@22050",
                    stdout=asyncio.subprocess.DEVNULL,
                    stderr=asyncio.subprocess.DEVNULL,
                )
                await asyncio.wait_for(process.wait(), timeout=30)
                if process.returncode != 0 or not output.exists():
                    raise HTTPException(503, "Could not create AI voice. Check the Mac's installed speech voice.")
                audio = output.read_bytes()
                if len(audio) < 44 or audio[:4] != b"RIFF" or len(audio) > 16_000_000:
                    raise HTTPException(503, "The speech engine returned invalid audio. Chat still works.")
                return audio
            except TimeoutError as error:
                raise HTTPException(504, "Voice generation took too long. Try a shorter reply.") from error
            except OSError as error:
                raise HTTPException(503, "The local speech engine is unavailable. Chat still works.") from error
            finally:
                # Also runs on cancellation; never leave synthesis running after
                # its request is cancelled or its temporary directory is removed.
                if process is not None and process.returncode is None:
                    process.kill()
                    await process.wait()


def openrouter_key() -> str:
    """The OpenRouter key: from the environment, else the runtime's root settings, where
    server/scripts/enable_openrouter.py stores it for the brains."""
    key = os.getenv("OPENROUTER_API_KEY", "").strip()
    if key:
        return key
    return profiles.env_values(profiles.RUNTIME_HOME / ".env").get("OPENROUTER_API_KEY", "").strip()


def openrouter_client() -> httpx.AsyncClient:
    """A separate function so tests can swap in a fake transport; nothing reaches the network."""
    return httpx.AsyncClient(timeout=OPENROUTER_TIMEOUT_SECONDS)


def is_mp3(audio: bytes) -> bool:
    """An ID3 tag or an MPEG frame sync at the start: enough to refuse an HTML or JSON body."""
    if audio[:3] == b"ID3":
        return True
    return len(audio) >= 2 and audio[0] == 0xFF and (audio[1] & 0xE0) == 0xE0


# OpenRouter's documented error statuses, as messages that make sense to the person in the chat.
OPENROUTER_FAILURES = {
    401: (503, "OpenRouter rejected the voice key. Run server/scripts/enable_openrouter.py again. Chat still works."),
    402: (503, "OpenRouter is out of credits, so AI voice is paused. Chat still works."),
    403: (503, "OpenRouter refused voice for this key (spend limit or access). Chat still works."),
    429: (429, "Voice is busy. Try playing the reply again in a moment."),
}


async def synthesize_openrouter(text: str) -> bytes:
    key = openrouter_key()
    if not key:
        raise HTTPException(503, "AI voice needs an OpenRouter key on this server. Run server/scripts/enable_openrouter.py. Chat still works.")
    if _synthesis_lock.locked():
        raise HTTPException(429, "Voice is busy. Try playing the reply again in a moment.")

    async with _synthesis_lock:
        body = {
            "model": config.MULA_SPEECH_MODEL,
            "input": text,
            "voice": config.MULA_SPEECH_VOICE,
            # MP3 carries its own sample rate; OpenRouter documents none for raw PCM.
            "response_format": "mp3",
        }
        headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
        try:
            async with openrouter_client() as client:
                response = await client.post(OPENROUTER_SPEECH_URL, json=body, headers=headers)
        except httpx.TimeoutException as error:
            raise HTTPException(504, "Voice generation took too long. Try a shorter reply.") from error
        except httpx.HTTPError as error:
            raise HTTPException(503, "Could not reach OpenRouter for AI voice. Chat still works.") from error

        if response.status_code != 200:
            failure = OPENROUTER_FAILURES.get(response.status_code)
            if failure is None:
                raise HTTPException(503, "OpenRouter could not create AI voice right now. Chat still works.")
            raise HTTPException(failure[0], failure[1])
        audio = response.content
        if len(audio) > MAX_AUDIO_BYTES or not is_mp3(audio):
            raise HTTPException(503, "The speech engine returned invalid audio. Chat still works.")
        return audio
