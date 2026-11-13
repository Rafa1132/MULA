# Mula — project context

Last updated: 13 November 2026 (Asia/Jakarta). Mula is the current name of the product previously called LARAS. The 23 October planning summary is kept as `LARAS-summary.md` at the repo root for history.

## What Mula is

Mula is an AI-powered business workspace for SME owners (UMKM) and their employees. Owners bring their business work, tools, and AI agents into one workspace, organize work into projects, and add ready-made applications when they need them.

## Problem

- SME owners rely on manual processes or disconnected tools, and find complex AI setup overwhelming.
- Owners use AI for brainstorming far more than for administrative automation. Source cited by the team: a survey of 204 Indonesian SMEs (67.6% brainstorming vs 33.3% administrative automation). Verify before publishing.
- BRIN reports digital adoption readiness at level 2 of 5 for Indonesian UMKM. Source cited by the team; verify before publishing.

## Users

- **Primary:** SME owners, working alone or with staff.
- **Early adopters:** digitally curious founders who already experiment with AI but lack time or budget to build custom software.

## MVP

1. A workspace with projects and tasks, and a short set of plug-and-play applications.
2. The first application is a sales and stock book. The owner records sales and stock by hand.
3. A daily summary agent reads those records and writes a plain-language summary.
4. After the MVP: an e-commerce integration. The owner chooses which platform they sell on and sets up the connection; Mula tracks sales from it.

## Later expansion (not MVP)

- A developer ecosystem where outside developers publish agents, integrations, and mini-apps. Developers earn revenue from it.

## Application model

- **Workspace:** the container for a business's projects, agents, and data.
- **Applications:** prepared by Mula and plugged into a workspace. Some are included, others are added for a fee. Mula controls their logic; users do not write code.

## Revenue (candidate, not final)

- Workspace subscriptions (free and paid tiers).
- Fees for add-on applications.
- Later: developer revenue share and usage-based fees.

## Architecture direction

- **AI:** all model calls go through the OpenRouter gateway with API keys. Mula does not host or deploy models.
- **Packaging:** each workspace is a Docker image. Standard users need little compute, so several workspaces may run on one server with enough capacity.
- **Data:** each user gets a separate database for security.
- **Connections:** integrations go through backend APIs or connectors. MCP is considered for tool connections.
- **Provisioning:** infrastructure as code.
- **Open:** the repo prototype (see `README.md`) describes a local Ollama/Qwen runtime. This conflicts with the hosted-only decision and needs to be reconciled.

## Open items

- Which applications and agents are in the first release beyond the sales and stock book.
- Which e-commerce platform the connector launches with, after the MVP.
- Developer ecosystem rules, if and when they enter scope.
- Infrastructure details.
- Timeline: not set.
