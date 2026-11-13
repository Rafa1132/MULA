# Mula decisions and open questions

Last updated: 13 November 2026 (Asia/Jakarta). Where an older decision conflicts with this file, this file governs.

## 13 November 2026 — Current direction (accepted by the user)

- **Name:** Mula is the product. LARAS is the former name.
- **MVP:** a workspace with projects and tasks, and a short set of plug-and-play applications. The first application is a sales and stock book recorded by hand. The e-commerce integration comes after the MVP.
- **First customer segment:** SME owners (UMKM).
- **First agent:** a daily summary agent that reads recorded sales and stock and explains them. It does not record data.
- **Automation of recording:** staged. Manual entry first, then automatic capture from a connector, POS, or spreadsheet import, then automatic reorder suggestions that still need owner approval.
- **E-commerce integration:** the owner chooses the platform they sell on and sets up the connection. Mula tracks sales from it. Launch with one platform behind a common interface.
- **AI access:** all model calls go through the OpenRouter gateway using API keys. Mula hosts no models.
- **Deployment:** Docker image per workspace; standard users may share a server with enough capacity. Separate database per user for security.
- **Timeline:** the three-week plan is a rough idea and is not confirmed.

## Open (not yet accepted)

- Which applications and agents are in the first release beyond the sales and stock book.
- Whether Obsidian note-taking is in the starting set.
- Which platform the connector launches with.
- Developer ecosystem rules (later scope).
- Infrastructure details (VPS sizing, autoscaling, load balancing, DNS, security).
- The repo prototype runs a local Ollama/Qwen model (see `README.md`). This conflicts with the hosted-only decision and needs to be reconciled.

## Superseded (condensed history)

- **27 October:** agent-first Operator AI on local Ollama; six-agent structure; Procurement and Inventory as core modules. Superseded by the MVP above.
- **24 October:** Store Manager as a template and feature-catalog host, with LARAS controlling feature logic. Partly superseded; the template and paid-add-on idea carries into applications.
- **29 October:** two-infrastructure ERD (platform plus per-app runtime). Still the design baseline for tenancy; vector placement is unconfirmed under the hosted-API decision.
- **Tokopedia first, Shopee later:** superseded. The owner picks the platform.
- **Local Qwen 27B production target:** superseded by the OpenRouter gateway.
