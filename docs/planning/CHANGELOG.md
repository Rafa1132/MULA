# Mula change history

Dates use Asia/Jakarta. Entries before 13 November 2026 are condensed. Each entry names its author.

## 13 November 2026 — Docs moved into the repo (El Kahfi, with Claude)

Request: move the planning docs into the shared repository so both team members' sessions read the same version.

Changed:
- Added `docs/planning/` with PROJECT_CONTEXT.md, REQUIREMENTS.md, DECISIONS.md, and CHANGELOG.md.
- These replace the claude.ai project copies as the source of truth.
- Earlier docs in the Claude project and the local Laras folder are out of date and should not be used.

Evidence: documentation only. No code changed.

Open: repo prototype runs local Ollama/Qwen, which conflicts with the hosted-only decision.

## 13 November 2026 — Direction reset and first app (El Kahfi, with Claude)

- Mula is the product; LARAS is the former name.
- Rewrote the planning docs around the workspace-plus-applications MVP, hosted-API AI through OpenRouter, a Docker image per workspace, and a separate database per user.
- First app set to a sales and stock book recorded by hand, with a daily summary agent.
- E-commerce integration moved after the MVP; owner chooses the platform.
- Old items (local Ollama, Qwen 27B, Tokopedia-first, six fixed agents, mandatory Procurement and Inventory modules) moved to superseded.

## Condensed earlier history

- **29 October 2026:** architecture and ERD documents created in the Laras folder. Accepted a two-infrastructure logical ERD.
- **27 October 2026:** generated-app boundary, dashboard flow, and UMKM adoption paths recorded.
- **26 October 2026:** target architecture requirements outlined.
- **24 October 2026:** project memory files created; Store Manager direction recorded; a Tokopedia browser signup was stopped at the user's request, with no account created.
- **23 October 2026:** original planning summary, kept as `LARAS-summary.md` at the repo root.
