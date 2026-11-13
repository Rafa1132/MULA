# Operator (client)

The building blocks for the Operator chat: the animated core, the reader for streamed replies, and CSV attachments. The chat screen itself lives in `features/workspace`; this feature supplies its parts.

## What it does

- **`OperatorCore`** draws the layered circular core on a canvas at about 30 fps. Its rings breathe and counter-rotate while idle. When a reply is being spoken, it reacts to the audio from an `AnalyserNode` supplied by `features/voice`. It pauses while the tab is hidden and stays still when the user prefers reduced motion.
- **`readChatStream`** reads the server's newline-delimited JSON reply stream. It handles JSON lines and multibyte characters that arrive split across network chunks. It raises an error on an `error` event or when the stream ends before `done`. It always cancels the reader, so Stop propagates through the proxy to Hermes.
- **`CsvAttachment`** provides a file picker and drop zone for a single `.csv` file. `readCsvFile` rejects files that aren't `.csv`, are empty, are over 50 KB, have a name over 120 characters, or aren't UTF-8, all before upload. The server does the real parsing.

## Stream events

| `type` | Fields | Meaning |
|---|---|---|
| `session` | `session_id` | The account's conversation UUID |
| `attachment` | `note` | Filename and row/column summary for the attached CSV |
| `memory` | `paths`, `note` | Memory files used for this reply, or confirmation of a `/remember` save |
| `token` | `content` | A piece of the answer text |
| `done` | `truncated` | The reply finished; `truncated` is true if it hit the length limit |
| `error` | `detail`, `status_code` | Hermes or runtime failure after streaming started |

## Files

| File | Purpose |
|---|---|
| `components/OperatorCore.tsx` | Canvas visualizer |
| `components/CsvAttachment.tsx` | Picker and drop zone UI |
| `services/stream.ts` | `readChatStream` and the `ChatEvent` type |
| `services/csv.ts` | `readCsvFile`, `CsvFile`, `MAX_CSV_BYTES` |
| `tests/stream.test.mjs`, `tests/csv.test.mjs` | Unit tests (`npm test`) |
| `index.ts` | Exports `OperatorCore`, `readChatStream`, `CsvAttachment`, `CsvFile` |

## Used by

`features/workspace` uses all of these. The forecasting panel reuses the `CsvFile` type.

## Server counterpart

`server/src/features/operator`: chat orchestration, CSV parsing, and the Hermes runtime adapter.
