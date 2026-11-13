# Team (client)

The **My team** page (`/team`). It lists the available agents and lets the owner set each one up. For Forecasting, it also hosts the forecast runner.

## What it does

- Loads `/api/auth/me`, then `/api/team`, which returns every agent with its account-specific settings.
- Each agent has a settings tab with:
  - **Additional instructions** (up to 4,000 characters), which personalize the agent but can't grant it new tools
  - **Reference data** (up to 8,000 characters), treated as untrusted context
  - **Enabled tools**: checkboxes for the agent's available tools
- **Save** sends `PUT /api/team/{agent}` with the current `revision`. If the settings were changed in another tab, the server returns 409.
- For Forecasting, a second tab embeds `ForecastPanel` from `features/forecasting`. Running a forecast is blocked until unsaved settings are saved.

Today the page shows two agents, **Operator** and **Forecasting**, because the server defines exactly those two.

## Files

| File | Purpose |
|---|---|
| `components/TeamPage.tsx` | Agent list, `AgentSettings` editor, tabs, sign-out |
| `services/team.ts` | `Agent` type and `teamRequest()` fetch helper with friendly 401/404 messages |
| `team.css` | Page styles |
| `tests/browser.spec.mjs` | Optional Playwright check of settings, forecasts, CSV export and layout |
| `index.ts` | Exports `TeamPage` |

The route is `src/app/team/page.tsx`. The proxies are `src/app/api/team/route.ts` (GET) and `src/app/api/team/[agent]/route.ts` (PUT, allowed only for `operator` and `forecasting`). The proxy limits these requests to 100 KB.

## Server counterpart

`server/src/features/team`: agent definitions, per-account settings and tool checks.

## Note for the Catalog direction

This page is the closest thing in the app to "installed capabilities". The list of agents is still hardcoded on both sides (the server's `AGENTS` dict and the proxy's allowlist).
