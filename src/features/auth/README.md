# Auth (client)

The sign-in and sign-up form: the `/login` and `/register` pages (`features/landing/AccountPage`), and the fallback a page shows when its session has expired.

## What it does

- On `/login` and `/register` the switch is a link to the other page, and success goes to `/workspace`; a signed-in visitor skips straight there. Elsewhere it flips the form in place and calls `onSignedIn()`.
- Asks `/api/auth/rules` which rules the server applies. With the development-only relaxed rules (`MULA_RELAXED_AUTH`, see the server README) any non-empty username and password are accepted and the hints say so; otherwise the usual 3–40 character username and 10-character password. When the server needs an invite code (`invite_required`), Create account adds an Invite code field; sign-in never shows it.
- Posts `{ username, password }` to `/api/auth/login` or `/api/auth/signup` through the Next.js proxy.
- Shows the server's error message (`detail`) when there is one, or the first validation rule that failed, such as "That username is already taken" or the 15-minute lockout after five failed attempts.
- Clears the password field after success, then calls `onSignedIn()` so the parent screen reloads the account and conversation.

The browser never handles the session token. The server sets it in the HttpOnly `mula_session` cookie.

## Files

| File | Purpose |
|---|---|
| `components/AccountForm.tsx` | The form, its validation messages and submit logic |
| `index.ts` | Public export: `AccountForm` |

## Used by

`features/landing` (`/login`, `/register`). The workspace page and the project pages (chat, memory, agents, apps, catalogue) render `AccountForm` when no account is loaded, and go to `/login` after signing out.

## Server counterpart

`server/src/features/auth`: account storage, password hashing, sessions and visible chat history.

## Not yet built

Password recovery, employee invitations, roles, and more than one workspace per account. (Projects inside the workspace are in `features/workspace`.)
