# Voice (client)

Everything voice-related in the browser:
- **AI voice output**, which plays server-generated WAV audio
- **Dictation**, where speech becomes text in the draft
- **Live conversation**, a hands-free loop of speak → reply → listen

## AI voice output: `services/speech.ts`

- `speechChunks(markdown)` removes code and Markdown formatting and splits the reply into chunks that fit the server's 1,200-character limit.
- `SpeechPlayer` requests each chunk from `POST /api/speech`, decodes the WAV with Web Audio, and plays it through an `AnalyserNode`. The chat screen's orb (`features/chat` → `features/orb`) animates from that analyser.
- `SpeechPlayer.play(url)` plays one recording made ahead of time (the workspace's spoken welcome) through the same analyser, so the orb reacts to it and `stop()` mutes it.
- A generation counter discards pending downloads and decodes after a cancel, so muted audio never starts late.
- Playback stops on mute or Chat mode, on a new message, when the tab is hidden, and on sign-out. The mute preference is saved in `localStorage` as `mula.voice-muted`. Earlier history never plays automatically.

## Dictation: `services/dictation.ts` and `hooks/useDictation.ts`

- Uses the browser's `SpeechRecognition` or `webkitSpeechRecognition`, so it needs a secure context. Some browsers send audio to an online recognition service.
- Languages are `en-US` and `id-ID`. The default comes from `navigator.language`, and the choice is saved as `mula.dictation-language`.
- Interim words appear in a separate preview. Finished phrases are appended to the draft with `appendDictation`. Dictation **never sends** a message by itself.
- Errors (permission denied, no microphone, no speech, unsupported language, service failure) are turned into clear messages.

## Live conversation: `services/liveConversation.ts`, `services/streamingSpeech.ts`, `hooks/useLiveConversation.ts`

- States: `off`, `starting`, `listening`, `responding`.
- After **1.4 s** of silence, the turn is finished and sent automatically. **20 s** with no speech pauses the session.
- `StreamingSpeech` starts speaking complete sentences or longer phrases while the reply is still streaming in.
- The microphone is paused while Mula responds. Tapping it interrupts the reply.
- Ending the session, muting, hiding the tab or signing out stops everything. Live mode isn't restored after a refresh.

## Files

| File | Purpose |
|---|---|
| `services/speech.ts` | `SpeechPlayer`, `speechChunks`, `VoiceState` |
| `services/streamingSpeech.ts` | Sentence-by-sentence speech during streaming |
| `services/dictation.ts` | Recognition wrapper and `appendDictation` |
| `services/liveConversation.ts` | Turn-taking controller |
| `hooks/useDictation.ts`, `hooks/useLiveConversation.ts` | React bindings |
| `tests/*.test.mjs` | Unit tests (`npm test`) |
| `tests/browser.spec.mjs`, `tests/live.browser.spec.mjs` | Optional Playwright checks with simulated recognition |
| `index.ts` | Exports `SpeechPlayer`, `speechChunks`, `VoiceState`, `useDictation`, `appendDictation`, `useLiveConversation` |

## Used by

`features/chat` (`useChatComposer`), which both the workspace assistant and project chat use.

## Server counterpart

`server/src/features/voice`, which provides text-to-speech only. Speech recognition happens entirely in the browser; audio recordings are never uploaded to Mula.

## Limits

This is turn-based, not full-duplex, so the user can't interrupt by speaking while Mula is talking. Audio is requested per segment, so short gaps can occur.
