# Mula requirements

Last updated: 13 November 2026 (Asia/Jakarta). Items in the superseded section are kept only as history.

## First customer segment

- SME owners (UMKM), working alone or with staff. Early adopters are digitally curious founders who already use AI but lack time or budget to build custom software.

## MVP scope (first release)

1. Core workspace: projects and tasks organized by business or goal.
2. Sales and stock book, the first plug-and-play app. The owner records sales and stock counts by hand. No external connection is needed.
   - Backend calculates stock levels and validates every stock or sales change.
   - Each entry is traceable to who recorded it and when.
3. Daily summary agent. It reads the owner's recorded sales and stock and writes a plain-language summary: what sold, what is running low, and what to reorder. It does not record data itself.
4. Obsidian note-taking remains a candidate for the starting app set. Not confirmed.

## Staged automation of sales and stock recording (post-MVP)

- **Stage 1, manual entry (MVP):** owner enters sales and stock by hand. Works for shops with no POS or online store.
- **Stage 2, automatic capture:** sales arrive automatically from an e-commerce connector, a POS, or a spreadsheet import. Stock updates follow each recorded sale.
- **Stage 3, automatic actions:** the system prepares reorders or stock alerts. Every change still goes through backend validation and owner approval.

## Post-MVP: e-commerce integration

- The business owner chooses which e-commerce platform they sell on and sets up the connection. Mula then tracks sales from that platform.
- Launch with one platform. Build the connector against a common interface so that additional platforms are adapters, not rewrites.
- Platform choice for launch is open. It should match the platform the first SME segment uses. Check that platform's API access and seller rules before committing.

## Later scope (not MVP)

- Developer ecosystem: outside developers publish agents, integrations, and mini-apps; revenue share for developers.
- Developer-published items are subject to extension rules that protect core workflows. Rules are to be defined.

## Application model

- Applications are prepared by Mula. Users add them to their workspace, and some carry a fee.
- Users do not build or deploy code. Mula controls application logic and backend configuration.

## AI access

- All model calls go through the OpenRouter gateway using API keys.
- Mula hosts and deploys no models. Local model hosting and the 27B self-hosting target are superseded.

## Controls that still apply

- Enforce company isolation, authentication, permissions, business validation, and approval authority in the backend.
- Each user's data lives in a separate database.
- Keep credentials out of model input and out of logs. Store them in a secrets store.
- Use backend functions for calculations and for any stock or sales change. Report real outcomes, failures, and pending work accurately.
- Human responsibility remains for physical checks, packing, handover, and receiving goods.
- Store connections need per-store authorization and secure token storage. Publishing or changing store data needs previews and explicit user approval.
- Plan HTTPS, backups, audit history, and capacity for production.

## Deployment

- Each workspace runs as a Docker image. Standard workspaces may share a server with enough capacity.
- Provisioning uses infrastructure as code.

## Superseded (history only)

- The 27 October plan to start with Operator AI on local Ollama.
- Tokopedia as the first marketplace priority.
- The fixed six-agent structure as the required product shape.
- Procurement, Inventory, and Store Manager as mandatory core modules for the MVP.
- LARAS-only control of the feature list as the sole ecosystem model.

## Evaluation

- Compare manual and Mula work on time, accuracy, success, model cost, and human effort.
- Measure response time, completion time, p50/p95 latency, and concurrency.
- Test missing data, cross-company access, insufficient stock, duplicate orders, expired tokens, and API failures.
- No performance, savings, or cost figures are measured yet.
