# Auth (client)

The sign-in and sign-up screen. It is shown whenever `/api/auth/me` returns 401.

## What it does

- Switches between **Sign in** and **Create account** on one form.
- Posts `{ username, password }` to `/api/auth/login` or `/api/auth/signup` through the Next.js proxy.
- Shows the server's error message (`detail`) when there is one, such as "That username is already taken" or the 15-minute lockout after five failed attempts.
- Clears the password field after success, then calls `onSignedIn()` so the parent screen reloads the account and conversation.

The browser never handles the session token. The server sets it in the HttpOnly `mula_session` cookie.

## Files

| File | Purpose |
|---|---|
| `components/AccountForm.tsx` | The form, its validation messages and submit logic |
| `index.ts` | Public export: `AccountForm` |

## Used by

`features/workspace` (`Workspace.tsx`) renders `AccountForm` when no account is loaded. The `/agents` and `/memory` pages instead redirect to `/` when the session has expired.

## Server counterpart

`server/src/features/auth`: account storage, password hashing, sessions and visible chat history.

## Not yet built

Password recovery, employee invitations, roles, and more than one workspace per account.
