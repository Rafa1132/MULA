# Orchestrator (client)

The assistant's chat on the `/workspace` entry screen and the `/settings` page. Server: `server/src/features/orchestrator/`.

## What it does

- **`AssistantPanel`** shows the onboarding state it is given (`features/workspace`'s `EntryStage` loads `/api/onboarding` and runs the spoken welcome). While onboarding is active it shows `OnboardingChat`; afterwards `AssistantChat`, with a thank-you (or "no problem") line when onboarding ended during this visit.
- **The assistant's name:** the first question is "What would you like to call me?" (optional, up to 40 characters; skipping keeps "Operator"). The name labels the assistant's chat lines, the log and the input, and is shown above the orb.
- **`OnboardingChat`**: the greeting and each question answered so far as chat lines (`onboardingTranscript`), then the current step: the shared composer (typed or dictated) labelled with the question, with **Skip this question** under it; the summary with **Looks right** and **Edit**; the personality form with **Save** and **Skip**. **Skip for now** is always there. Each new step takes the keyboard focus and the log scrolls to it; refusals (for example an email address) appear as an alert and the question stays open.
- **`AssistantChat`**: the ongoing chat, on the shared chat (`features/chat`), so it behaves like a project's Operator: Markdown replies, replies read aloud unless muted, **Play reply**, the mic, live conversation, suggestions when empty, and **Stop** (the server still finishes that turn). Enter sends, Shift+Enter adds a line; a failed send gives the text back.
- **`ProposalCard`**: when the assistant proposes a project (its `create_project` tool), a card under that reply shows the name and description with **Create project** and **Not now**. Nothing exists until **Create project**; then the card says so with an **Open** link (which takes the focus) and the workspace shows the new card.
- **`SettingsPage`** (`/settings`): **Your assistant** (`AssistantSettingsForm`: its name, empty for the default, and whether it may propose projects), edit the four `USER.md` answers (`AboutForm`), change the personality (`PersonalityForm`, radio groups), and **Restart the questions**, which returns to `/workspace#assistant`.
- After registering, `features/landing` sends a new account to `/workspace#assistant`, so onboarding is on screen on a phone too.

## Files

| File | Purpose |
|---|---|
| `services/orchestrator.ts` | API calls (plain `fetch`: nothing here belongs to a project), labels, `onboardingTranscript` |
| `components/AssistantPanel.tsx` | Onboarding or chat |
| `components/OnboardingChat.tsx` | The scripted onboarding |
| `components/AssistantChat.tsx` | The ongoing chat |
| `components/ProposalCard.tsx` | A proposed project with Create project / Not now |
| `components/AssistantSettingsForm.tsx` | Settings: the assistant's name and project proposals |
| `components/AboutForm.tsx`, `components/PersonalityForm.tsx` | Shared by onboarding and Settings |
| `components/SettingsPage.tsx` | `/settings` |
| `tests/orchestrator.test.mjs` | Transcript (including the name question), proposals grouped by reply, calls |
| `tests/browser.spec.mjs` | Optional Playwright check against a running backend (no model calls, no voice; creates two accounts): Tap to begin focus, start without sound, naming the assistant, keyboard onboarding, refusals, skip, summary edit, personality, reload, Settings, restart, Skip for now, contrast, phone width |
| `orchestrator.css` | Styles (theme tokens only) |
