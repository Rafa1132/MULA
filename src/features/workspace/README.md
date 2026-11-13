# Workspace (client)

The main screen at `/`. It combines the sidebar, the Operator core, the saved conversation, the composer, CSV attachment and all voice controls. This is where the client-side features are connected together.

## What it does

- **Session:** loads `/api/auth/me`. On 401 it shows `AccountForm`; otherwise it loads `/api/conversation` to restore the account's single ongoing chat. Sign-out (`/api/auth/logout`) takes the place of a "New chat" button.
- **Sending a turn:** posts `{ message, stream: true, session_id, csv_file? }` to `/api/chat`. It reads the reply with `readChatStream`, adds `token` events to the reply as they arrive, and shows `attachment` and `memory` notes under the message. **Stop** cancels the request. If a send fails, the attachment is restored so the user can retry.
- **Composer:** message limit of 8,000 characters. Enter sends and Shift+Enter adds a new line. Send is disabled while dictation is running.
- **CSV:** one `CsvAttachment` per message, added by drag-and-drop or the picker.
- **Voice:**
  - A `SpeechPlayer` reads completed replies aloud unless Chat mode or mute is on
  - **Play reply** replays an answer
  - The microphone button runs `useDictation`
  - **Start live conversation** runs `useLiveConversation`
  - Playback stops when the tab is hidden
- **Layout:** an expandable chat view. The sidebar has Workspace, My team and Memory, plus Reports and My website shown as "Soon".

## Files

| File | Purpose |
|---|---|
| `components/Workspace.tsx` | The whole screen (about 23 KB, the largest component) |
| `index.ts` | Exports `Workspace` |

The route is `src/app/page.tsx`.

## Depends on

- `features/auth` (`AccountForm`)
- `features/operator` (`OperatorCore`, `CsvAttachment`, `readChatStream`)
- `features/voice` (`SpeechPlayer`, `useDictation`, `useLiveConversation`, `appendDictation`)
- `common/components` (`Sidebar`, `Icon`, `MulaLogo`)

## Server endpoints reached through the proxy

`/api/auth/*`, `/api/conversation`, `/api/chat` → `/api/agents/operator/chat`, `/api/speech`.

## Notes

`Workspace.tsx` handles session, chat, streaming, attachments and three voice modes in one component. If it keeps growing, the chat state and the voice orchestration could be split into hooks.
