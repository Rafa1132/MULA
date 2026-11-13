# Voice (server)

Text-to-speech for AI voice output. It currently uses macOS's built-in `say` command on the machine running the backend, with no API key, paid provider or model download.

## Endpoint

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/api/speech` | `{ text }`: 1–1,200 characters, not blank, no NUL characters; requires login | `audio/wav` (16-bit, 22,050 Hz), `Cache-Control: no-store` |

A plain GET returns 405. `scripts/run.py` uses that to check that a running server has this route.

## How `synthesize()` works

1. Returns 503 if the backend isn't running on macOS (`sys.platform != "darwin"`).
2. Allows **one job per process**: a second request while one is running gets a 429 rather than waiting in a queue.
3. Writes the text to a private temporary file and runs `/usr/bin/say -f <file> -o <wav>` directly, with no shell. The text is never passed as a command-line argument, so it can't inject flags.
4. Times out after 30 seconds, reads the WAV, and deletes the temporary folder.

This only produces audio; it doesn't call the model or add anything to the conversation.

## Files

`routes.py`, `service.py`, `tests/test_speech.py`. `__init__.py` exports `router`.

## Client counterpart

`src/features/voice` handles chunking, playback, dictation and live conversation.

## Limits

- Works only with a macOS backend. A Linux or cloud deployment needs a replacement text-to-speech provider.
- Uses whatever system voice is configured on that Mac.
- If the client disconnects, a running job isn't cancelled immediately; it finishes within the 30-second limit.
