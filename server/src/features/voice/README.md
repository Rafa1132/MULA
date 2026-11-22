# Voice (server)

Text-to-speech for AI voice output: macOS's built-in `say` command on a Mac backend (free, no key), or OpenRouter's text-to-speech with Kokoro on a Linux backend such as the VPS (paid per character, with the OpenRouter key the brains use).

## Endpoint

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/api/speech` | `{ text }`: 1–1,200 characters, not blank, no NUL characters; requires login | `audio/wav` (16-bit, 22,050 Hz) from `say`, `audio/mpeg` from OpenRouter; `Cache-Control: no-store` |
| GET | `/api/speech/welcome` | Requires login | The workspace's spoken welcome (`orchestrator.onboarding.WELCOME`) in the same format, `Cache-Control: private, max-age=86400` |

A plain GET returns 405. `scripts/run.py` uses that to check that a running server has this route.

## How `synthesize()` works

With `say`:

1. Returns 503 if the backend isn't running on macOS (`sys.platform != "darwin"`).
2. Allows **one job per process**: a second request while one is running gets a 429 rather than waiting in a queue.
3. Writes the text to a private temporary file and runs `/usr/bin/say -f <file> -o <wav>` directly, with no shell. The text is never passed as a command-line argument, so it can't inject flags.
4. Times out after 30 seconds, reads the WAV, and deletes the temporary folder.

With `openrouter` (`synthesize_openrouter`):

1. Reads `OPENROUTER_API_KEY` from the environment, else from the runtime's root `.env`, where `server/scripts/enable_openrouter.py` stores it. Without a key it answers 503 and sends nothing.
2. Allows one job per process, like `say` (429 for a second one), which also bounds spending.
3. POSTs `{model, input, voice, response_format: "mp3"}` to `https://openrouter.ai/api/v1/audio/speech` with a 30-second timeout. MP3 because it carries its own sample rate; OpenRouter documents none for raw PCM. The browser decodes it with `decodeAudioData`, as it does WAV.
4. Checks the answer is MP3 (an ID3 tag or an MPEG frame sync) and at most 16 MB. OpenRouter's 401, 402 (out of credits), 403 and 429 get their own messages; other failures a generic one. No message contains the spoken text or the key.

Either way it only produces audio; it doesn't call the chat model or add anything to the conversation.

## The spoken welcome (`welcome.py`)

The welcome's words are fixed, so its audio is made once and kept at `<data dir>/speech/welcome-<hash>.wav` (`.mp3` with OpenRouter) (owner-only, written atomically; the hash covers the provider, model, voice and text, so a change to either makes a new file). The first request makes it if it is missing; `server/.venv/bin/python server/scripts/generate_welcome_audio.py` makes it ahead of time.

## Provider

`MULA_SPEECH_PROVIDER` in `server/.env.hermes` picks the voice:

| Value | Engine | Notes |
|---|---|---|
| `say` (default) | macOS `say` | Free and local; macOS backends only. |
| `openrouter` | OpenRouter text-to-speech | For a Linux backend. Paid per character: Kokoro costs $0.99 (DeepInfra) to $4 (Together) per million characters on OpenRouter, depending on which provider serves the request, so even a 1,200-character reply costs under half a cent. Needs `OPENROUTER_API_KEY`. |
| `off` | none | Every speech route answers 503 "AI voice is switched off on this server. Chat still works."; the workspace then shows the welcome as text. |

With `openrouter`, `MULA_SPEECH_MODEL` (default `hexgrad/kokoro-82m`) and `MULA_SPEECH_VOICE` (default `af_heart`) pick the model and voice. Kokoro's voices are listed at https://openrouter.ai/api/v1/audio/speech/models/hexgrad/kokoro-82m (for example `af_bella`, `am_adam`, `bf_emma`, `bm_george`). Restart the backend after changing them; the welcome is made again for the new voice.

## Files

`routes.py`, `service.py`, `welcome.py`, `tests/test_speech.py`. `__init__.py` exports `router`.

## Client counterpart

`src/features/voice` handles chunking, playback, dictation and live conversation.

## Limits

- `say` works only with a macOS backend; a Linux backend uses `openrouter` (or `off`).
- `say` uses whatever system voice is configured on that Mac.
- `openrouter` spends credits on every spoken reply, and voice pauses with a clear message when credits run out.
- If the client disconnects, a running job isn't cancelled immediately; it finishes within the 30-second limit.
