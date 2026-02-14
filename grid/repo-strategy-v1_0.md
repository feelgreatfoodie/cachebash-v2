# Rezzed.ai: Repo Strategy v1.0

> *"The Grid. A digital frontier."* — Kevin Flynn

**Date:** 2026-02-13
**Author:** ISO (with Flynn)
**Status:** Ratified
**Reference:** Grid Blueprint v1.0

---

## Overview

Rezzed operates across **two GitHub organizations** under Flynn's control, each with a distinct purpose, audience, and visibility strategy. External client organizations exist separately and are documented here only for boundary clarity.

---

## The Two Organizations (Flynn-Controlled)

### 1. `feelgreatfoodie` — White-Label Seed Lab

**Purpose:** Christian's prototyping and testing space. White-label products are built and battle-tested here before graduating to `rezzed-ai` for production release. This is where CacheBash currently lives.

**Audience:** Christian only (during development). May be shown to collaborators or evaluators as "work in progress."

**Visibility:** Public or private per-repo (Christian's discretion)

**What lives here:**
- Product prototypes and MVPs (e.g., CacheBash today)
- White-label product testing
- Integration experiments (MCP servers, API prototypes)
- Pre-production repos that seed `rezzed-ai` products
- Basher/agent execution testing
- Personal exploration projects, learning repos, community contributions

**What does NOT live here:**
- Finalized production products (graduate to → `rezzed-ai`)
- Client-specific work (→ client orgs)
- Grid infrastructure docs (→ `rezzed-ai`)

**Graduation criteria** (repo moves from `feelgreatfoodie` → `rezzed-ai`):
- Product has passed the POC Gauntlet
- Core bugs are fixed, architecture is stable
- CLAUDE.md is Grid-aware
- CI/CD is configured
- No hardcoded test credentials or personal references
- Flynn approves the migration (Flynn-reserved decision)

**Note:** The `feelgreatfoodie` repo stays as historical record after graduation. It does not get deleted — it's part of the builder story (Build Forward principle).

---

### 2. `rezzed-ai` — Production / Product Studio

**Purpose:** Rezzed's production monorepo and product repos. This is the architecture showcase — where the Grid lives, products ship, and technical credibility is demonstrated.

**Audience:** Technical evaluators, potential acquirers, collaborators, and product users.

**Visibility:** Mixed — monorepo structure public, sensitive configs private.

**What lives here:**

```
rezzed-ai/
├── grid/                           # The Grid monorepo (primary)
│   ├── packages/                   # All deployable products
│   │   ├── cachebash/
│   │   ├── problems-finder/
│   │   └── [product-name]/
│   ├── libs/                       # Shared libraries
│   ├── grid/                       # Grid infrastructure
│   │   ├── programs/               # Program .md specs
│   │   ├── stores/                 # Knowledge stores
│   │   ├── workflows/              # Workflow templates
│   │   └── council/                # Council session templates
│   ├── infrastructure/             # IaC
│   ├── docs/                       # External docs
│   └── tools/                      # Dev tools
│
├── rezzed.ai/                      # Marketing site (if separate)
└── [standalone-products]/          # Products that outgrow the monorepo
```

**What does NOT live here:**
- Unproven prototypes (→ `feelgreatfoodie` until graduation)
- Credentials, API keys, secrets (→ GCP Secret Manager / GitHub Secrets)
- **Any reference to any client by name**

**⚠️ HARD RULE: No client names in `rezzed-ai` repos.** Products are built for market categories, not for specific clients. If a product was inspired by a client engagement, the product docs describe the *problem space* — never the client.

---

## External Client Orgs (NOT Flynn-Controlled)

External companies interact with Rezzed strictly as **clients**. They purchase products and services through normal client-vendor relationships.

**Rules:**
- No external entity has ownership of, claim to, or attribution in Rezzed products, IP, or Grid infrastructure

**What lives in client orgs (not Rezzed):**
- Client-owned project repos
- Client internal tools and templates
- Client-specific configuration for Rezzed products they consume

**What does NOT live in client orgs:**
- Rezzed product code
- Grid infrastructure or program specs
- Any Rezzed IP

**Access:** Rezzed has no organizational access to client orgs. If a client needs a Rezzed product, they use it as a customer — same as any other client.

---

## IP Firewall Rules

These rules protect Rezzed's sovereign IP and prevent entanglement with any external entity.

| Rule | Enforcement |
|------|-------------|
| No client names in `rezzed-ai` repos | Code review gate. Products describe problem spaces, not clients. |
| No Rezzed IP in client repos | Rezzed products are consumed as services/packages, never forked into client orgs. |
| No shared GitHub teams across Rezzed ↔ client orgs | Separate collaborator lists. No cross-org team memberships. |
| No `rezzed-ai` repo references in client repos | Client repos reference product URLs/APIs, not source repos. |
| Client-specific config stays in client orgs | If a Rezzed product needs client-specific config, that config lives in the client's own infrastructure. |
| Grid infrastructure is Rezzed-exclusive | Program specs, workflow templates, knowledge stores — none of this leaves `rezzed-ai`. |

**The Productization Engine exception:** When a client engagement reveals a repeatable problem, the *problem* (not the client context) enters the POC Roadmap. The product built from it is generic and lives in `rezzed-ai` with zero client attribution.

---

## Flow Between Orgs

```
┌───────────────────────┐         ┌───────────────────────┐
│    feelgreatfoodie    │────────►│      rezzed-ai        │
│  (White-Label Seed    │ Product │  (Production/Products)│
│       Lab)            │ Graduates│                       │
└───────────────────────┘         └───────────┬───────────┘
                                              │
                                   Products serve clients
                                   Client friction → new
                                   problem discovery
                                              │
                                              ▼
                                  ┌───────────────────────┐
                                  │   External Clients    │
                                  │                       │
                                  │  ⚠️ Separate entities │
                                  │  No IP flows upstream │
                                  └───────────────────────┘
```

### Key Flows:

1. **Prototype → Production**: Product prototypes in `feelgreatfoodie` graduate to `rezzed-ai` when they pass the POC Gauntlet and Flynn approves migration. The seed repo stays as historical record.

2. **Client Problem → Product Idea**: When any client engagement reveals a repeatable problem, the *problem description* (never the client identity) enters the POC Roadmap via ISO. If it survives the POC Gauntlet, it becomes a product in `rezzed-ai`.

3. **Product → Client Consumption**: Rezzed products are consumed by clients as deployed services, packages, or APIs. Product source code stays in `rezzed-ai`. Client-specific config stays in the client's own infrastructure.

4. **Shared Libraries**: Components extracted by RAM's Extraction Trigger live in `rezzed-ai/grid/libs/`. These are Rezzed IP — clients consume them through product interfaces, not by accessing source.

---

## Access & Permissions

| Org | Owner | Collaborators | Visibility | Rezzed IP? |
|-----|-------|---------------|------------|------------|
| `feelgreatfoodie` | Christian | — | Mixed (Christian's discretion) | Pre-production only |
| `rezzed-ai` | Christian (as Flynn) | Future team, CI/CD accounts | Mixed (public structure, private configs) | **Yes — all Rezzed IP** |
| External client orgs | Client ownership | Client teams | Private | **No — external** |

---

## Naming Conventions

| Context | Convention | Example |
|---------|-----------|---------|
| Rezzed product repos | lowercase-kebab | `cachebash`, `problems-finder` |
| Seed lab prototypes | freeform (Christian's preference) | `cachebash` (current) |
| Shared libraries | `lib-[domain]` | `lib-auth`, `lib-firestore-utils` |
| MCP servers | `mcp-[integration]` | `mcp-firestore`, `mcp-github` |

---

## Evaluator Path

When someone evaluates Christian's technical credibility:

1. **See `feelgreatfoodie`** → Work-in-progress prototypes, iterative development, builder story
2. **See `rezzed-ai`** → Production architecture, shipped products, Grid sophistication
3. **Together they tell the story**: iteration (seed lab) + execution (production)

External client orgs are not part of the Rezzed story.

---

## Migration Checklist

### Already Done
- [x] Create `rezzed-ai` GitHub organization
- [x] Register `rezzed.ai` domain
- [x] Secure `rezzed.dev@gmail.com` and `rezzed.user@gmail.com`

### Cycle 1 (Current)
- [ ] Deploy Grid-aware CLAUDE.md to `feelgreatfoodie/cachebash`
- [ ] Audit `feelgreatfoodie/cachebash` for hardcoded references (Task 3.2)
- [ ] Document graduation checklist for CacheBash → `rezzed-ai`

### Future (Post-Cycle 1)
- [ ] Set up `rezzed-ai` org-level settings (branch protection, secret scanning)
- [ ] Initialize monorepo with Nx/Turborepo
- [ ] Graduate CacheBash: fork/move into `rezzed-ai/grid/packages/cachebash/`
- [ ] Configure CI/CD service accounts for `rezzed-ai`
- [ ] Set up GitHub Secrets for GCP service account keys
- [ ] Enable Dependabot and secret scanning on `rezzed-ai`

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| v1.0 | 2026-02-13 | Founding document. Two-org strategy: `feelgreatfoodie` (seed lab) / `rezzed-ai` (production). IP Firewall rules. External client boundary. Graduation criteria. Migration checklist. |

---

*End of Line.*
