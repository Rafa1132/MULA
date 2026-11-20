# Chat (client)

The one chat screen used by both the workspace assistant (`features/workspace` → `features/orchestrator`) and every project's Operator (`features/project`), so the two look and behave the same. Each page keeps only what is its own: the workspace has the entrance, the spoken welcome, onboarding and project proposals; a project has streamed replies, CSV upload and requests to other agents.

## What it does

- **`ChatStage`**: the screen, black in both themes. It redefines the theme tokens locally, so everything inside is its dark version, and its accent is the brand mint that the art direction reserves for the orchestrator (`docs/design/agent-art/`). It shows:
  - a top bar with **Mute** and the page's own controls (logo and account on the workspace; the project switcher and links on phones);
  - the agent's name above the orb (`features/orb`), and a status line (`Ready when you are`, `Thinking…`, `Speaking…`, `Listening…`);
  - **Expand chat**, which shrinks the orb to a 64 px badge so the conversation has the room;
  - in a project, the screen is exactly one window tall (`.app-shell` in `globals.css`): the chat log scrolls, never the page. On a short window the orb shrinks (`orbSizeFor`, down to 64 px) so the composer stays on screen. A phone held sideways (under ~445 px tall) still needs Expand chat;
  - the conversation and composer, filling the rest.
- **`ChatMessages`**: the agent's lines on the left with its name, the owner's on the right. Replies render as Markdown (no raw HTML; links open in a new tab). Each line can carry a note, cards (proposals or agent requests) and **Play reply**. The log scrolls inside itself and follows new lines only while the owner is at the bottom.
- **`ChatComposer`**: one pill with the field, the mic (dictation), live conversation, voice options (replies as **Chat** or **Voice**, and the speech language) and **Send**, which becomes **Stop** while a reply is on its way. Enter sends, Shift+Enter adds a line. A page can wrap the form, e.g. in the CSV drop zone.
- **`ChatSuggestions`**: the empty conversation's starting points; picking one fills the field, it never sends.
- **`useChatComposer`**: the state behind all of it: the draft, dictation, live conversation, spoken replies (`SpeechPlayer`), mute and whether a reply is on its way. The chat that owns the messages registers its own send and stop with `connect`, so the mic and live conversation work the same on both pages. Mute is remembered in `localStorage` as `mula.voice-muted` (the key the project chat always used), and the stage's Mute button and the composer's Chat/Voice switch are the same setting.

## Files

| File | Purpose |
|---|---|
| `components/ChatStage.tsx` | The screen: top bar, name, orb, status, Expand chat |
| `components/ChatMessages.tsx` | The conversation |
| `components/ChatComposer.tsx` | The composer and its hints and errors |
| `components/ChatSuggestions.tsx` | Starting points for an empty chat |
| `hooks/useChatComposer.ts` | Draft, voice, dictation, live conversation, busy |
| `services/chat.ts` | Pure rules: status line, orb state, orb size, mute storage |
| `tests/chat.test.mjs` | Unit tests for `services/chat.ts` |
| `chat.css` | The screen's styles (imported by `ChatStage`) |
| `index.ts` | Exports the above |

## Checks

`npm test` runs the unit tests. The browser checks that drive this screen are `features/workspace/tests/entry.browser.spec.mjs` (workspace) and `features/voice/tests/browser.spec.mjs` (a project's mic and composer), both with the API faked.

## Limits

- The workspace assistant's replies arrive whole, not streamed; live conversation hears each one when it arrives. Stopping a workspace reply stops waiting for it; the server still finishes the turn and the reply is there the next time the chat opens.
- The agent chat inside **My agents** (`features/team`, `AgentChat`) is a separate, smaller chat and is not on this screen yet.
