# Store management (experimental, not connected)

An early experiment toward connecting a marketplace store, starting with Tokopedia Seller Center. **Nothing in the Mula app uses this folder yet.** No route, server feature or agent calls it.

## What is here

| Path | What it is |
|---|---|
| `tokopedia.py` | A standalone Python Playwright script. It opens `https://seller-id.tokopedia.com/` in a visible Chromium window with a persistent profile, waits while you log in by hand, prints the current URL, and keeps the browser open until you press Enter |
| `tokopedia_session/` | The persistent Chromium profile created by that script. It holds **real login state** for seller-id.tokopedia.com, and for tiktok.com via the shared login: cookies, saved login data, local and session storage, IndexedDB and browsing history |

## Running it

The script needs Python Playwright (`pip install playwright` and `playwright install chromium`). It isn't in `server/requirements.txt`.

`USER_DATA_DIR` is the relative path `./tokopedia_session`, so run the script **from this folder**. Otherwise it creates a new, empty profile wherever you started it.

```sh
cd src/features/store-management
python tokopedia.py
```

## ⚠️ Security

`tokopedia_session/` holds live session credentials for your seller account. Anyone with a copy of it may be able to act as your store.

- The repository `.gitignore` doesn't currently exclude it. Add `src/features/store-management/tokopedia_session/` (or `*_session/`) before committing, and check whether it is already tracked (`git ls-files src/features/store-management`).
- Don't share, upload or back up this folder with the rest of the code.

## Why it doesn't fit yet

- It's **Python inside the Next.js client tree** (`src/features/`). Every other client feature is TypeScript and exports through `index.ts`. Server-side automation belongs under `server/src/features/`.
- Browser automation against the seller UI is fragile and may conflict with the marketplace's terms. If an official seller API is available, it would be a more stable basis for an integration.

## Possible direction

A future store integration would likely be a server feature, or a Catalog integration exposed as a tool. It would sit behind `features/team` tool checks and the owner-approval rules the Operator prompt already describes ("never claim an action was completed without confirmation from a connected tool").
