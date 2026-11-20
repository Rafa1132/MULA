# Project chat (client)

A project's main screen at `/projects/[projectId]`: the sidebar and the Operator's chat. The chat is the shared chat screen (`features/chat`), the same one the workspace assistant uses, so the two look and behave alike; this feature adds what only a project has: streamed replies, CSV attachment and requests to other agents.

## What it does

- **Session:** loads `/api/auth/me`. On 401 it shows `AccountForm`; otherwise it loads `/api/conversation` to restore the project's single ongoing chat. Every project call goes through `projectFetch`, which sends the project from the URL in `X-Mula-Project`. Sign-out (`/api/auth/logout`) takes the place of a "New chat" button.
- **Sending a turn:** posts `{ message, stream: true, session_id, csv_file? }` to `/api/chat`. It reads the reply with `readChatStream`, adds `token` events to the reply as they arrive, and shows `attachment` and `memory` notes under the message (memory ids used, a `/remember` result, or `Saved to memory: [id]` when the Operator saved during the turn). **Stop** cancels the request. If a send fails, the attachment is restored so the user can retry.
- **Requests to other agents:** a `request` event shows a card under the reply: "Operator wants to ask Forecasting", the question, and **Ask Forecasting** / **Not now**. Approving streams `POST /api/agents/requests/{id}/approve`: the card turns to "working", then "answered", and the Operator's relay arrives as a new reply noted "Answer from Forecasting". Requests made under "Go ahead" are approved automatically once the Operator's reply ends (not for requests made during a relay, so the Operator can't loop). On reload, `/api/conversation` returns the requests and each card returns under the reply that made it (`services/requests.ts`). After a refused approve or decline, the cards are re-read from the server.
- **Composer** (`ChatComposer`): one pill, in this order: **+** (attach a CSV), the message field, the microphone, the live-conversation button, a **Voice options** menu and send/stop. Message limit of 8,000 characters. Enter sends and Shift+Enter adds a new line. Send is disabled while dictation is running. Hints (unsupported speech, live conversation, dictation in progress, the 8,000-character stop) appear above the pill only while they apply.
- **Voice options menu:** holds the Chat/Voice reply mode and the speech language, with the note that the browser's speech service may process audio online. It closes on a click elsewhere or Escape.
- **CSV:** one `CsvAttachment` per message, picked with **+** or dropped on the pill. The file shows as a chip floating above the pill.
- **Voice** (`useChatComposer`):
  - A `SpeechPlayer` reads completed replies aloud unless muted (Chat mode); the screen's **Mute** button is the same setting
  - **Play reply** replays an answer; **Stop audio** appears under the pill while audio plays
  - The microphone button runs `useDictation`
  - The live-conversation button (labelled **Start live conversation** / **End live conversation**) runs `useLiveConversation`
  - Playback stops when the tab is hidden
- **Layout** (`ChatStage`): black, with **OPERATOR** above the new orb, which shows speaking, listening and thinking, and the status line; **Expand chat** shrinks the orb to a badge. Replies are speech bubbles with the agent's name. An empty conversation offers three suggestion chips. The sidebar is the logo, the project switcher (the project's name; "Untitled project" until it is named), the navigation (Chat, Catalogue, My apps, My agents, Memory, all inside this project) and the account. On phones the sidebar gives way to the switcher, My agents, Memory and sign-out in the chat screen's top bar.

## Files

| File | Purpose |
|---|---|
| `components/ProjectChat.tsx` | The screen: session, streaming, CSV, agent requests, on the shared chat |
| `components/AgentRequestCard.tsx` | One request from the Operator to another agent |
| `services/requests.ts` | Places request cards under their replies |
| `tests/requests.test.mjs` | Unit tests for `services/requests.ts` |
| `tests/browser.spec.mjs` | Optional Playwright check of request cards (decline, approve, reload, Go ahead, phone). Needs a stand-in runtime that calls `ask_agent` |
| `index.ts` | Exports `ProjectChat` |

The route is `src/app/projects/[projectId]/page.tsx`.

## Depends on

- `features/auth` (`AccountForm`)
- `features/chat` (`ChatStage`, `ChatMessages`, `ChatComposer`, `ChatSuggestions`, `useChatComposer`), which uses `features/voice` and `features/orb`
- `features/operator` (`CsvAttachment`, `readChatStream`)
- `common/components` (`Sidebar`, `Icon`, `MulaLogo`)

## Server endpoints reached through the proxy

`/api/auth/*`, `/api/conversation`, `/api/chat` → `/api/agents/operator/chat`, `/api/agents/requests/{id}/approve|decline`, `/api/speech`.

## Notes

The voice orchestration (dictation, live conversation, spoken replies) moved into `features/chat`'s `useChatComposer`; `ProjectChat.tsx` keeps the session, streaming, attachments and agent requests.
