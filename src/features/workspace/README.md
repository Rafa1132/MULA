# Workspace (client)

The page at `/workspace`: everything above the projects. A signed-in user lands here after logging in or registering. It is one vertical page: a full-height black entry screen with the owner's assistant, then the projects below.

## What it does

- **Entry screen (`EntryStage`, `#assistant`):** the shared chat screen (`features/chat`, the same as a project's chat), one screen tall, with the assistant's name above the orb, its chat underneath and **Your projects ↓** at the bottom.
  - **Entrance:** on the first visit in a browser session the orb fades and grows in over about 2 s, then the chat fades up (2.3–2.7 s); a reload in the same session plays a 0.5 s version (`sessionStorage` `mula.workspace.entered`); under reduced motion everything is there at once. The timings are in `workspace.css` and `services/entry.ts`.
  - **Spoken welcome (new accounts only):** **Tap to begin** (or a tap on the orb) plays the pre-made welcome from `GET /api/speech/welcome` through `SpeechPlayer.play`, so the orb reacts to the audio; the same words are the chat's first line. **Start without sound** skips the audio. The welcome is marked heard on the server as it starts, so it plays once per account even if the audio fails (then a note says why and the text is still there). Returning owners get a silent orb and their chat.
  - **Mute** (top bar, `aria-pressed`) stops the welcome at once. It is the shared chat's voice setting (`mula.voice-muted`), so it also decides whether the assistant's replies are read aloud, as in project chat.
  - **Focus:** lands on **Tap to begin**, then in the chat input once the welcome starts, but only if the owner hasn't already put it somewhere; on touch screens it never moves into the input, so the keyboard doesn't cover the orb.
  - The orb shows `speaking` while the welcome plays and `thinking` while a reply is on its way.
- **Projects:** one card per project with its name ("Untitled project" when it has none), its description when it has one, its creation date, **Open** and, for the owner, **Rename** (an inline form; an empty name makes it Untitled again; Escape cancels and gives focus back to Rename). **New project** opens an inline form with an optional name and goes straight to the new project's chat. A workspace holds up to 20 projects (`max_projects` from `/api/workspace`); when it is full, **New project** is off and a note says why. A project the assistant proposed and the owner confirmed appears as a card straight away.
- **Coming soon:** **Invite teammates** and each card's **GitHub** button are real buttons marked `aria-disabled` with a "Coming soon" badge; they do nothing yet.
- **Assistant:** the entry screen's chat is `AssistantPanel` from `features/orchestrator`: onboarding the first time, then the owner's assistant across projects. The top bar links to `/settings`.
- **Old links:** `/memory`, `/agents`, `/apps`, `/apps/todo`, `/catalogue` and `/catalogue/[id]` render `OpenFirstProject`, which sends the user to the same page in their first project, or to `/workspace` when they have none.

## Files

| File | Purpose |
|---|---|
| `components/WorkspacePage.tsx` | The page: the entry screen, then the project list and new project |
| `components/EntryStage.tsx` | The first screen: the shared chat screen plus the entrance, Tap to begin and the cue |
| `services/entry.ts` | Entrance, focus rule and entrance storage (pure, unit-tested) |
| `components/ProjectCard.tsx` | One project: links, rename, GitHub placeholder |
| `components/OpenFirstProject.tsx` | Redirect for pre-project addresses |
| `services/projects.ts` | `fetchWorkspace`, `fetchProjects`, `createProject`, `renameProject`; errors carry the HTTP `status` |
| `tests/entry.test.mjs` | Unit tests for `services/entry.ts` |
| `tests/entry.browser.spec.mjs` | Optional Playwright check of the entry screen (fakes the API and the audio): entrance and reduced motion, focus, the welcome and its caption, mute, voice off, start without sound, naming the assistant, a proposed project created from its card, phone width, contrast |
| `tests/browser.spec.mjs` | Optional Playwright check (fakes the API): cards and links, placeholders, rename by keyboard, contrast, new untitled project, empty and full workspace, old links, the project switcher, phone width |
| `workspace.css` | Page styles |

## Related

- Project pages live under `/projects/[projectId]/` (chat, memory, agents, apps, catalogue). Links inside them use `projectPath()` and `useProjectId()`; API calls use `projectFetch()`, which adds the `X-Mula-Project` header (`common/services/project.ts`).
- `common/components/ProjectSwitcher.tsx` is the top-left control on project pages: the project's name and a list of the other projects (same section) and **All projects**.
- Server: `server/src/features/workspaces/`.
