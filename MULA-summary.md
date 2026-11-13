# Mula — Product Summary

**Mula is a business workspace that helps owners bring their work, tools, and AI agents together in one environment.** It is designed for solo founders and small businesses, including people without a technical team. The workspace is the core product; the Mula Catalog and developer ecosystem make it extensible.

## The problem

Small business owners often manage work across disconnected tools. Adding specialized software or AI support can involve technical setup, multiple services, and costs that are difficult to manage. At the same time, experts and developers can face significant barriers when turning their knowledge into software and reaching business customers.

## The product

### Mula Workspace

The Workspace is the central environment where a business owner can communicate with Mula's Operator, organize work, monitor available agents, and use business capabilities. Businesses can use it independently or involve employees, with work and access organized around their needs.

### Mula Catalog

The Catalog is where business owners discover and add capabilities to their Workspace, including agents, integrations, plugins, and business mini-apps. It acts as a software catalog for extending business workflows. The Catalog is not the whole product: it makes the Workspace adaptable as a business's needs change.

### Mula Developers

Mula Developers is the planned creator-facing experience for building, packaging, and publishing products for the Catalog. It is intended to help independent experts and developers turn specialized knowledge into installable business software, without requiring Mula itself to build every specialized service.

## How the ecosystem grows

The Catalog is designed to create a reinforcing cycle: more businesses using Mula give creators a larger audience and clearer demand; more creators bring useful capabilities to the Catalog; and a richer Catalog makes the Workspace useful to more businesses. As users add capabilities, their individual Workspaces can grow with their needs while the overall Mula ecosystem expands.

Mula's role is to provide the Workspace, the extension platform, and the path for discovery and installation. Independent creators provide many of the specialized solutions available within it. The Catalog can become an advantage as this user and creator ecosystem develops; it is a strategic goal, not yet an established moat.

## Lean Canvas overview

### Customer segments

- **Business owners:** Solo founders and owners of micro and small businesses who want to organize work and add useful software or AI support without managing a complex technical setup.
- **Creators:** Independent experts and developers who want to turn their knowledge into agents, apps, integrations, or plugins and distribute them to business users.

### Early adopters

- Digitally curious small business owners already experimenting with AI or juggling several tools, with recurring work they want to manage more easily.
- Experts and developers who already have, or are ready to create, a practical product for small businesses and want a route to publish it.

### Top problems

1. Small business owners manage work across disconnected tools, scattering information and making daily operations harder to organize.
2. Finding, setting up, and connecting useful software or AI support can take time, technical skills, and money that small businesses may not have.
3. Turning specialized knowledge into software and getting it in front of businesses can require technical, operational, and distribution resources beyond a creator's expertise.

### Solutions

1. **Mula Workspace:** Bring business work, projects, and AI agents together in one environment.
2. **Mula Catalog:** Let owners discover and add agents, apps, and integrations as their needs change.
3. **Mula Developers:** Provide a straightforward path for experts and developers to build, package, and publish products for the Catalog.

### Existing alternatives

Comparable ecosystems include **Zoho One and Zoho Marketplace**, **Salesforce Agentforce and AgentExchange**, **Microsoft 365 Copilot and its Agent Store**, **Odoo Apps**, and **Zapier Agents**. They overlap with parts of Mula's direction, such as unified business software, extension catalogs, agent discovery, integrations, or developer publishing. Mula's intended focus is a workspace for smaller businesses where these capabilities and creator-built products fit together in one extensible environment.

## Application-building direction

Mula's planned mini-app builder uses supported building blocks rather than generating arbitrary software from scratch. An owner describes the business they are building, reviews possible directions, and structures pages and features from capabilities available in Mula. Page and feature additions should have clear, established prices. AI can help shape styling, content, and configuration within the supported system; unsupported requests should be explained, with a nearby available capability suggested when possible.

## Revenue direction

Potential revenue sources include Workspace subscriptions, usage charges for AI or platform resources, and optional paid Catalog products. Creator compensation may be tied to paid product subscriptions or a share of Mula's platform fee on attributable usage. Exact plans, fees, and revenue shares have not been finalized.

## Current prototype versus product vision

The repository currently contains an early Mula workspace prototype. The implemented experience includes an Operator chat using the Hermes runtime, account-scoped conversation history, CSV analysis, categorized inspectable memory with retrieval, an early Forecasting agent, agent settings, and voice input/output. The README documents the current implementation and its limits.

The broader Catalog, public developer-publishing experience, installable third-party products, multi-business collaboration, deployable mini-app builder, and production multi-region service are product direction—not claims about features already available in the prototype. The existing forecasting and Operator features do not yet represent the full agent marketplace or automatic specialist-agent workflow.

## Product principle

**Mula provides an approachable environment for businesses to use and extend software; its creator ecosystem expands what that environment can do.** The goal is to help non-technical owners adopt useful capabilities while giving developers and domain experts a way to build products for those businesses.
