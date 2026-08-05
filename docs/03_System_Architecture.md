# 03 — System Architecture

**Version:** 1.3
**Date:** 2026-08-05
**Status:** **BASELINE** — ADR-001, ADR-012, ADR-015 approved 2026-08-05; ADR-002 ratified by Constitution Art. 11
**Governed by:** [00_Constitution](00_Constitution.md) v1.0 — binding
**Traces to:** [02_SRS](02_SRS.md) v1.1

---

## 1. Architectural Drivers

The drivers below are what actually shape this design. Everything else is detail.

| # | Driver | Source | Consequence |
|---|---|---|---|
| AD-1 | One codebase, two deployment models | D-01, NFR-22 | Backend must not depend on serverless primitives |
| AD-2 | Tenant isolation must be undefeatable | FR-PLT-002, NFR-13 | Enforcement belongs in the database, not application code |
| AD-3 | Every cost figure traceable | D-10, FR-CST-010…014 | Calculation must emit a persisted derivation tree, not a number |
| AD-4 | Formulas editable at runtime | D-09, FR-FRM-001 | Sandboxed evaluator + versioning + historical snapshotting |
| AD-5 | Ledger correctness is absolute | DI-1, NFR-20 | Append-only, exact decimal, transactional |
| AD-6 | Six archetypes, one system | D-06 | Strategy pattern over a discriminated model |
| AD-7 | No jurisdiction in code | D-03 | Tax as data + adapter plugins |
| AD-8 | Long-running work | MRP, close, reports | First-class job queue, not request-scoped compute |
| AD-9 | Arabic RTL parity | NFR-01…03 | Logical CSS properties; RTL in the design system from day one |
| AD-10 | Domain must be testable in isolation | NFR-19, NFR-20 | Clean Architecture; framework-free domain layer |

---

## 2. ADR-001 — Application Framework

**Status:** PROPOSED — deviates from stated preference, requires approval
**Context:** Client preference lists Next.js, React, TypeScript, PostgreSQL, Prisma, Tailwind, shadcn/ui, Redis, WebSockets, with explicit authorisation to choose a better enterprise stack.

### Decision

**Retain the entire stated stack. Add a dedicated backend framework — NestJS — and use Next.js for the presentation tier only.**

```
Next.js 15 + React 19   ← presentation only (UI, SSR, BFF proxy)
NestJS                  ← application + domain + infrastructure
PostgreSQL 16 + Prisma  ← as specified
Redis + BullMQ          ← cache, sessions, job queue
WebSockets              ← as specified
Tailwind + shadcn/ui    ← as specified
```

### Why not Next.js alone

Next.js is an outstanding frontend framework. As the *only* tier for an ERP it fails on four of the ten drivers:

| Driver | Failure with Next.js alone |
|---|---|
| **AD-1** dual deployment | Route handlers assume a request/response lifecycle. On-premise needs resident workers, schedulers, and daemons that outlive a request. |
| **AD-8** long-running work | MRP runs, period close, and large report generation exceed request timeouts. There is no first-class worker model. |
| **AD-10** testable domain | File-system routing pulls business logic toward the framework. Keeping the domain framework-free means fighting the framework's grain for years. |
| **AD-5** transactional integrity | Complex multi-aggregate transactions (a work order completion touching stock, GL, costing, and events atomically) need explicit lifecycle and DI control that route handlers do not provide. |

NestJS supplies precisely what is missing: dependency injection (enabling AD-10 and SOLID's dependency-inversion principle), modules that map to bounded contexts, native queue and scheduler integration, WebSocket gateways, interceptor-based cross-cutting concerns, and a plain Node process that containerises identically for cloud and on-premise.

### Rejected alternatives

| Option | Rejected because |
|---|---|
| Next.js only | Four driver failures above |
| Next.js + separate Express service | Hand-rolls the DI, module, and queue infrastructure NestJS already provides, with no compensating benefit |
| .NET / Java Spring | Genuinely excellent for ERP, but abandons the client's TypeScript stack and splits the team's language |
| Odoo / ERPNext fork | Inherits a Python monolith whose product model is exactly what §10 of the SRS argues against |

### Consequences

- **Positive:** domain layer has zero framework imports; workers scale independently; the same container runs SaaS and on-premise; frontend and backend evolve separately.
- **Negative:** two applications instead of one; a shared type contract to maintain (mitigated by a shared package in the monorepo); marginally more deployment surface.
- **Cost of deferring:** low now, very high later. Extracting a domain layer out of Next.js route handlers after Phase 5 is a rewrite.

**This is the single decision with the widest downstream blast radius. It needs an explicit yes or no.**

---

## 3. ADR-002 — Multi-Tenancy

**Status:** PROPOSED
**Context:** D-01/D-02 — multi-tenant SaaS *and* dedicated on-premise, one codebase, isolation that cannot be defeated by an application bug.

### Decision

**Shared database with PostgreSQL Row-Level Security as the default; database-per-tenant as a deployment option. Identical application code in both.**

Every tenant-scoped table carries `tenant_id`. An RLS policy filters on a session variable set per request:

```
Request → resolve tenant → open transaction
        → SET LOCAL app.tenant_id = '<uuid>'
        → all queries in this transaction see only that tenant
```

The critical property: **if application code forgets a tenant filter, the database still returns nothing.** Isolation does not depend on developer discipline.

### How one codebase serves both models

| | SaaS multi-tenant | On-premise |
|---|---|---|
| Database | Shared, RLS active | Dedicated, RLS active |
| Tenants present | Many | Exactly one |
| Application code | Identical | Identical |
| Connection resolution | Per-request from host/token | Static from config |

On-premise is not a special build. It is the same binary with one tenant row. This satisfies NFR-22 literally.

### Rejected alternatives

| Option | Rejected because |
|---|---|
| Application-layer filtering only | One forgotten `where` clause is a cross-tenant data breach. Unacceptable for financial data. |
| Schema-per-tenant | Migration across thousands of schemas becomes an operational hazard; connection pooling degrades |
| Database-per-tenant as default | Strongest isolation, but per-tenant migration and backup cost is high at SaaS scale. Retained as an *option* for enterprise clients demanding physical separation. |

### Consequences

- Prisma does not set session variables natively; a client extension wrapping every operation in a transaction with `SET LOCAL` is required. This is well-trodden but must be built and tested in Phase 1.
- **Mandatory:** an automated test suite that attempts cross-tenant access through every repository method and asserts zero rows. This runs on every build (NFR-13).
- Tenant-aware connection pooling must be verified under load before Phase 2.

---

## 4. Clean Architecture Layering

Fulfils AD-10 and NFR-19. Dependencies point **inward only**.

```
┌──────────────────────────────────────────────────┐
│ PRESENTATION   Next.js · REST controllers        │
│                WebSocket gateways · CLI          │
├──────────────────────────────────────────────────┤
│ APPLICATION    Use cases · orchestration          │
│                DTOs · ports (interfaces)          │
├──────────────────────────────────────────────────┤
│ DOMAIN         Entities · value objects           │
│                domain services · business rules   │
│                ZERO framework imports             │
├──────────────────────────────────────────────────┤
│ INFRASTRUCTURE Prisma · Redis · queue · email     │
│                adapters implementing ports        │
└──────────────────────────────────────────────────┘
        Infrastructure depends on Domain.
        Domain depends on nothing.
```

### The rule that is enforced, not merely stated

The domain layer must not import Prisma, NestJS, Next.js, or any I/O library. This is enforced by an ESLint boundary rule that **fails the build**, not by review discipline.

Rationale: this single constraint is what makes NFR-20 (100% branch coverage on ledger, cost, tax, formula) achievable. Domain logic that needs a database to be tested does not get tested to 100%.

### SOLID in practice here

| Principle | Concrete application |
|---|---|
| Single responsibility | One use case per class; a costing strategy computes cost and does not persist |
| Open/closed | A seventh product archetype adds a strategy class; no existing file is edited |
| Liskov | Every costing strategy honours the same contract and returns a complete cost sheet |
| Interface segregation | Ports are narrow — `StockReader` is not `StockRepository` |
| Dependency inversion | Domain declares ports; infrastructure implements them; NestJS DI wires them |

---

## 5. Monorepo Structure

```
erp-platform/
├─ docs/                    the eight governed documents
├─ apps/
│  ├─ api/                  NestJS — application, domain, infrastructure
│  ├─ web/                  Next.js — admin and back-office UI
│  ├─ shopfloor/            Next.js — touch-optimised terminal (NFR-05)
│  ├─ portal/               Next.js — customer portal
│  ├─ marketing/            Next.js — public cinematic site (07_UI_UX)
│  └─ worker/               NestJS — queue consumers, schedulers
├─ packages/
│  ├─ brand/                identity · colour · type · spacing · a11y standards
│  ├─ motion/               easing curves · duration scales · reduced-motion
│  ├─ icons/                one icon family, RTL-aware
│  ├─ utils/                pure helpers — format, dates, numerals
│  ├─ charts/               data visualisation (ERP-first)
│  ├─ ui-erp/               shadcn/ui — dense, fast, RTL-aware
│  ├─ ui-market/            cinematic — R3F, GSAP, scroll choreography
│  ├─ domain/               framework-free entities and rules
│  ├─ contracts/            shared DTOs and API types
│  ├─ i18n/                 AR/EN message catalogues
│  ├─ formula/              sandboxed expression engine
│  └─ decimal/              exact monetary arithmetic
├─ prisma/                  schema and migrations
└─ tools/                   codegen, lint rules, boundary enforcement
```

Tooling: **Turborepo** for task orchestration and caching; **npm workspaces** (see ADR-016).

### 5.1 ADR-016 — npm workspaces instead of pnpm

**Status:** ACCEPTED 2026-08-05 (deviation from §5 as first written)

The C: drive on the build machine has **1.2 GB free** (D: has 55 GB). pnpm would require a new global toolchain install via corepack, whose home defaults to C:. npm 10.9.8 is already present with its cache **already redirected to `D:\dev-cache\npm`**, so it writes nothing to C:.

Turborepo — the actual orchestration value — is unaffected. pnpm's strict `node_modules` would have helped enforce the `ui-market`/ERP import boundary, but ADR-015 already enforces that by lint rule, so nothing is lost that was being relied on.

**Reversible** at any time: delete `node_modules`, add `pnpm-workspace.yaml`, reinstall.

### 5.2 Barrel discipline — enforced, not advised

`packages/ui-market/src/index.ts` must **never** re-export anything that imports three.js or R3F at module scope.

Measured consequence of getting this wrong: exporting `CanvasHost` from the barrel put the WebGL runtime in the initial bundle for every consumer, taking the marketing route's First Load JS to **398 kB**. Moving it to the `@erp/ui-market/canvas` subpath behind a dynamic import brought it to **172 kB** — a 226 kB reduction with no functional change.

`CanvasHost` is therefore reachable only via its subpath export.

`packages/domain` holds pure business logic shared by `api` and `worker`. It has no runtime dependencies beyond `packages/decimal`.

---

## 6. Bounded Contexts

Each SRS module becomes a NestJS module and a domain package boundary. Cross-context communication is by **domain events**, not direct imports — this is what keeps the modular monolith from decaying into a ball of mud, and what makes later extraction to services possible without redesign.

```
        ┌────────────┐   OrderConfirmed   ┌─────────────┐
        │  CRM/Sales │ ─────────────────► │Manufacturing│
        └─────┬──────┘                    └──────┬──────┘
              │ InvoiceIssued                    │ ProductionCompleted
              ▼                                  ▼
        ┌────────────┐  StockMoved        ┌─────────────┐
        │  Finance   │ ◄───────────────── │  Inventory  │
        └────────────┘                    └─────────────┘
              ▲                                  ▲
              └──────── CostSheetIssued ─────────┘
                         ┌────────────┐
                         │Cost Engine │
                         └────────────┘
```

**Deployment shape: a modular monolith.** Not microservices. Rationale: an ERP's core transaction spans sales, stock, costing, and GL atomically. Distributing that transaction buys operational complexity and eventual-consistency bugs in exchange for scaling that a mid-market ERP does not need. The module boundaries are drawn strictly enough that extraction remains possible if load ever justifies it.

### 6.1 ADR-012 — Transactional boundary tiering

**Status:** PROPOSED — required to resolve Constitution tension T-1

Constitution Article 3 requires every module to be extractable as a microservice. Article 10 requires a sale to reliably and immediately produce inventory movements and accounting entries. **These conflict.** A distributed ledger posting is eventually consistent, and an eventually consistent trial balance can be out of balance during the window. That is not acceptable for financial data.

**Decision — two tiers, both strictly bounded, both event-publishing:**

| Tier | Modules | Property |
|---|---|---|
| **Transactional core** | INV · MFG · CST · FIN · TAX | Share one ACID transaction. Extractable only as a unit, never individually. |
| **Extractable** | CRM · RPT · NTF · HRM · DMG · ECM · AIL · MDM · PUR | Communicate by domain events. Independently extractable. |

Article 3's *intent* — no tight coupling, clean boundaries — holds in both tiers. What the core tier declines is the ability to split the ledger away from the stock and cost calculations that feed it.

**Rejected alternative:** full independent extractability including Accounting, using sagas and compensating entries. Technically achievable; rejected because it trades guaranteed ledger correctness for a scaling property this system does not need.

**This requires explicit approval per Article 16.**

---

## 7. Cost Engine Architecture

Fulfils AD-3 and FR-CST-001…020. **The most important design in this document.**

### 7.1 The traceability problem

"Every calculation must be traceable" (D-10) is not satisfiable by a function returning a number. It requires the calculation to **emit its own derivation** as it runs.

### 7.2 Design — the Cost Sheet as a derivation tree

Every calculation produces an immutable, persisted tree:

```
CostSheet  #CS-2026-0001   rev 1   item: Hi-Vis Vest (Hybrid)  qty: 500
│
├─ Material Cost                                        EGP 42,150.00
│  ├─ Fabric — polyester hi-vis           formula: FRM-UNIF-FAB v3
│  │  ├─ input  size_matrix[L]  = 1.42 m²    ← BOM v7 line 2
│  │  ├─ input  unit_cost       = 58.00      ← WAC @ 2026-08-05
│  │  ├─ input  waste_pct       = 8.0%       ← BOM v7 line 2
│  │  └─ output 1.42 × 58.00 × 1.08 × 500 = EGP 44,452.80
│  └─ Reflective tape …
│
├─ Printing Cost                          formula: FRM-PRINT-SCR v5
│  ├─ setup   plates 2 × 180.00 = 360.00     ← amortised over 500
│  └─ run     500 × 1.40        = 700.00
│
├─ Embroidery Cost                        formula: FRM-EMB-STITCH v2
│  ├─ input  stitch_count = 8,400            ← Design DSN-0042 v3
│  ├─ input  heads        = 12               ← WC-EMB-02
│  └─ output …
│
├─ Machine · Labour · Packaging · Waste …
├─ Total Production Cost                                EGP 71,204.30
├─ Cost Per Unit                                        EGP    142.41
└─ Price · Gross Profit · Margin …
```

Every leaf names its **formula version**, its **input values**, and each input's **source**. FR-CST-012 (expand any figure to its derivation) is then a UI rendering of a structure that already exists — not a reconstruction after the fact.

### 7.3 Immutability

A cost sheet is written once. Later changes to formulas, prices, or BOMs cannot alter it, because it stores resolved *values* and *version ids*, not references to live records. Recalculation creates revision *n+1* alongside the original.

This is what makes FR-CST-015 (estimated vs actual variance) meaningful: both sides of the comparison are fixed points.

### 7.4 Strategy composition

```
CostingStrategy (port)
├─ PrintingCostStrategy      setup amortisation · area · impressions · spoilage
├─ EmbroideryCostStrategy    stitch count × heads × rate · thread · digitising
├─ UniformCostStrategy       size-dependent BOM · CMT labour · trims
├─ SafetyProductStrategy     landed cost · value-add operations
├─ CustomProductStrategy     fully formula-driven
└─ HybridCostStrategy        composes the above; deduplicates shared overhead
```

`HybridCostStrategy` is the reason the Strategy pattern is used rather than a switch: it *composes* other strategies and must not double-count setup or overhead claimed by more than one child. That logic has one home.

---

## 8. Formula Engine Architecture

Fulfils AD-4 and FR-FRM-001…012.

### 8.1 The risk, stated plainly

"All production formulas must be editable from the Admin Panel" (D-09) means **user-supplied expressions execute on the server**. Implemented naively — `eval`, `new Function`, or an unrestricted interpreter — this is remote code execution by design, exposed through an admin screen.

It is entirely achievable safely. It is not achievable carelessly.

### 8.2 Design

| Control | Implementation |
|---|---|
| Grammar | Purpose-built expression language. Arithmetic, comparison, conditionals, whitelisted functions. **No loops, no assignment, no I/O, no host object access.** |
| Parsing | Parse to AST, validate, then interpret the AST. The expression string is never passed to any JS execution primitive. |
| Variable access | Only variables the engine explicitly injects for that context |
| Function access | Documented whitelist: `min`, `max`, `round`, `ceil`, `floor`, `abs`, `if` |
| Limits | Bounded evaluation time, AST node count, and recursion depth |
| Arithmetic | Exact decimal throughout — never IEEE 754 floats (DI-3) |

### 8.3 Versioning and snapshotting

```
Admin edits formula
   → new version created (prior version untouched, never mutated)
   → activation requires validation + mandatory change comment
   → new calculations use the new version
   → existing cost sheets keep their recorded version id → results never drift
```

This is the mechanism behind FR-FRM-006 and FR-CST-014. An auditor recalculating a two-year-old quotation gets the two-year-old answer.

---

## 9. Tax Engine Architecture

Fulfils AD-7 and FR-TAX-001…012.

```
Document line
   → determination: (jurisdiction, customer class, item class, txn type, date)
   → matching rule set, effective at document date
   → ordered tax components (VAT, withholding, stamp, …)
   → per-component rounding
   → persisted tax breakdown, immutable on the document
```

Rules are **data**. Adding a jurisdiction means inserting configuration rows.

**Extensibility for e-invoicing (FR-TAX-011/012):** documents carry an extensible attribute set, and a jurisdiction adapter interface exists in the core. When Egypt ETA or KSA ZATCA is confirmed, the integration is a plugin implementing that interface plus configuration rows — not a change to the invoice schema. This is the mitigation for the project's highest-risk unknown (SRS §9), and it is why building the *capability* now while deferring the *jurisdiction* is safe.

---

## 10. Data Architecture Principles

| # | Principle | Mechanism |
|---|---|---|
| DA-1 | Ledger is append-only | No UPDATE/DELETE grant on posting tables. Enforced by database permission, not convention. |
| DA-2 | Stock derived from movements | Balances are materialised projections, rebuildable from the movement log |
| DA-9 | **Cost layers are the storage of record** | Every receipt is a layer (qty, unit cost, date, lot, source). WAC is computed *from* layers; FIFO/LIFO/Specific consume them. See §10.1. |
| DA-3 | Exact decimal money | `DECIMAL` in Postgres; a decimal library in application code; floats prohibited in financial paths by lint rule |
| DA-4 | Tenant id on every scoped table | RLS policy (ADR-002) |
| DA-5 | Temporal correctness | Rates, prices, and formulas carry validity ranges; documents resolve values at document date |
| DA-6 | Soft delete for master data | `deleted_at`; transactional data never deleted |
| DA-7 | Audit by trigger | Database triggers write audit rows, so no application path can bypass them |
| DA-8 | Gapless fiscal numbering | Database sequence with a dedicated allocation table under transaction |

### 10.1 Inventory Valuation Architecture

Constitution Article 9 requires four valuation methods configurable per company. This is **not** a settings toggle over one number — the methods need structurally different data.

**Decision: store cost layers universally; make valuation a strategy over them.**

```
ValuationStrategy (port)
├─ WeightedAverageStrategy   computes running average across open layers
├─ FifoStrategy              consumes oldest layer first, splitting on partial
├─ LifoStrategy              consumes newest layer first          ⚠ IFRS-prohibited
└─ SpecificCostStrategy      consumes the named lot/serial layer
```

Every receipt writes a layer. Every issue records **which layers it consumed and in what quantity**, which is what makes FR-INV-012f (unit cost traceable back to its originating receipt) possible — and gives Article 5's "every cost must explain where it came from" a foundation underneath the cost engine, not just inside it.

Weighted Average could have been stored as a single running figure. It is not, because a WAC-only store cannot later be migrated to FIFO without reconstructing every layer from the movement log. Storing layers from day one costs more in Phase 2 and removes an entire class of future migration.

**⚠ LIFO** is implemented but disabled by default. It is prohibited under IFRS (IAS 2), and Egyptian Accounting Standards are IFRS-aligned. Enabling it surfaces a persistent non-compliance warning (FR-INV-012e).

**Immutability:** valuation method is fixed per company after the first posted transaction (FR-INV-012d). Changing it later is a formal, audited revaluation — not a settings edit.

---

## 11. Background Processing & Real-Time

**Queue — BullMQ on Redis.** Consumers run in `apps/worker`, scaled independently.

| Job class | Examples |
|---|---|
| Scheduled | Reorder evaluation, expiry alerts, PPE inspection due, scheduled reports, FX rate refresh |
| Long-running | Period close, MRP, large exports, recalculation batches |
| Reactive | Document generation, email, event projection |

**Real-time — WebSocket gateway.** Tenant- and permission-scoped channels: work order progress (FR-MFG-024), stock alerts, approval notifications, dashboard updates.

**Degradation (NFR-18):** if Redis is unavailable, transaction processing continues. Cache misses fall through to the database; jobs queue on reconnect; real-time updates degrade to polling. **A cache outage must never stop an invoice from being issued.**

---

## 12. Caching Strategy

| Tier | Contents | Invalidation |
|---|---|---|
| Redis — hot | Sessions, permission sets, tenant config, FX rates | Event-driven |
| Redis — computed | Dashboard aggregates, report snapshots | TTL + event |
| Postgres — materialised | Stock balances, AR/AP ageing, cost roll-ups | Transactional refresh |

**Never cached:** any figure appearing on a fiscal document. Invoices and cost sheets read from source, always.

---

## 13. Security Architecture

**[GAP] Stated per NFR-15 and SRS §6.1:** the reference workspace available to this project contains **0 authentication assets and no recorded security practice**. This layer is built from zero against published standards. Nothing here is adapted from prior work, and I will not imply otherwise.

| Layer | Control |
|---|---|
| Transport | TLS 1.3; HSTS |
| Authentication | Argon2id; short-lived access token + rotating refresh token; TOTP MFA |
| Session | Server-side registry in Redis enabling true revocation (FR-IAM-008) |
| Authorisation | Deny-by-default guards on every endpoint; permissions resolved per request |
| Record scope | Company/branch/warehouse filters composed into every query |
| Field scope | Cost and margin fields stripped at the serialisation boundary, not hidden in the UI |
| Tenant | RLS (ADR-002) + automated cross-tenant breach tests on every build |
| Input | Schema validation at every boundary; parameterised queries only |
| Formula | Sandbox per §8 |
| Secrets | Environment or secret store; never in source; scanned in CI |
| Audit | Database triggers (DA-7) |
| Rate limiting | Per tenant, user, and endpoint class; stricter limits on auth and export endpoints (NFR-15a) |
| CSRF | Token or SameSite strategy on every state-changing request (NFR-15b) |
| XSS | Output encoding, strict CSP, no unsanitised HTML rendering (NFR-15c) |
| SQL injection | Parameterised queries only; raw SQL prohibited by lint rule (NFR-15d) |
| Restore | Scheduled, verified restore drill — not a documented intention (NFR-17a) |
| Dependencies | Automated vulnerability scanning in CI |

**Phase 1 exits only through an explicit security review**, including a cross-tenant isolation test and a formula-sandbox escape attempt.

---

## 14. Internationalisation & RTL

Fulfils AD-9 and NFR-01…03.

| Concern | Approach |
|---|---|
| Direction | CSS **logical properties** throughout (`margin-inline-start`, never `margin-left`). Enforced by lint rule. |
| Layout | `dir` attribute at the document root; components must never assume LTR |
| Typography | Arabic-first font stack with correct shaping and line height |
| Icons | Directional icons mirror; non-directional (logos, brands) do not |
| Charts | Axis order and legend placement mirror in RTL |
| Numerals | Configurable Arabic-Indic vs Western digits |
| Data | Translatable master data stored as structured translations, not duplicated rows |
| PDF | RTL-capable rendering engine; **verified by visual regression test, not by inspection** |

Arabic RTL is validated continuously from Phase 1. Retrofitting RTL after a component library has hardened around LTR assumptions is one of the most expensive mistakes available in this project.

---

## 15. AI-Readiness

Fulfils D-13 without committing to unspecified features (OPEN-32).

**Constitution Article 14 is enforced structurally, not by policy: the AI layer is given no write port.**

There is no code path by which an AI component posts an entry, adjusts stock, alters master data, or approves a document — not because it is forbidden to, but because the capability is not wired into its dependency graph. A future feature wanting AI to write would have to change the architecture, which is exactly the friction Article 14 intends.

| Provision | Purpose |
|---|---|
| **No write port injected** | AI cannot mutate business data under any code path (FR-AIL-000) |
| Advisory output only | Predictions, recommendations, insights, forecasts, anomalies, decision support (FR-AIL-00a) |
| Labelled in UI | AI suggestions never render as system-computed fact (FR-AIL-00b) |
| Append-only domain event stream | A clean history for training and analytics (FR-AIL-001) |
| Stable identifiers, clean text fields | Indexable without a migration (FR-AIL-002) |
| Read-only, permission-respecting data port | AI consumers cannot bypass RBAC (FR-AIL-003) |
| Plugin boundary | ERP fully functional with AI disabled (FR-AIL-004) |
| Data-residency boundary | No data leaves without per-tenant opt-in (FR-AIL-005) |

**[GAP]** No AI, RAG, vector-store, or agent implementation exists in available reference material. Phase 8 is greenfield, and is deliberately last so that it consumes a stable domain rather than shaping one.

---

## 16. Deployment Topologies

### SaaS

```
CDN → Next.js (web/portal/shopfloor)
        ↓
      NestJS API  ×N   ← stateless, horizontally scaled
        ↓
   PostgreSQL (primary + read replica)   Redis   Object storage
        ↑
      Workers ×M
```

### On-Premise

Same containers, single compose/Kubernetes bundle, one tenant, local object storage, scheduled backup to client-designated storage. **No code differences** (NFR-22).

Both topologies are built from one artefact set in CI. On-premise is a configuration profile.

---

## 17. Observability

Structured JSON logs with correlation IDs propagated across HTTP, queue, and WebSocket boundaries. Metrics: request latency, queue depth, job duration, database pool saturation, cost-engine evaluation time. Distributed tracing across API → worker → database. Health and readiness endpoints.

**Domain-level alerting** matters as much as infrastructure alerting: trial balance out of balance, inventory sub-ledger diverging from its GL control account, or a failed formula evaluation are production incidents.

---

## 18. Testing Architecture

| Level | Scope | Target |
|---|---|---|
| Unit — domain | Entities, strategies, formula evaluation | **100% branch** on ledger, cost, tax, formula (NFR-20) |
| Unit — application | Use cases with mocked ports | High |
| Integration | Repositories against real PostgreSQL | All repositories |
| **Isolation** | Cross-tenant access attempts | **Every repository method, every build** |
| Contract | API against shared contracts | All endpoints |
| E2E | Quote → order → production → invoice → GL | Critical paths |
| Visual regression | LTR **and RTL**, light and dark | All screens |
| Load | Concurrency per NFR-11 | Before each phase gate |

---

## 19. ADR Index

| ADR | Decision | Status |
|---|---|---|
| ADR-001 | NestJS backend + Next.js presentation | **APPROVED** 2026-08-05 |
| ADR-002 | RLS shared-database multi-tenancy, DB-per-tenant optional | Ratified by Constitution Art. 11 |
| ADR-003 | Clean Architecture, build-enforced boundaries | Proposed |
| ADR-004 | Modular monolith, not microservices | Proposed |
| ADR-005 | Turborepo + pnpm monorepo | Proposed |
| ADR-006 | Exact decimal arithmetic, floats prohibited | Proposed |
| ADR-007 | Cost Sheet as persisted derivation tree | Proposed |
| ADR-008 | Custom sandboxed formula grammar | Proposed |
| ADR-009 | Tax as configuration + jurisdiction adapters | Proposed |
| ADR-010 | BullMQ for background work | Proposed |
| ADR-011 | CSS logical properties, lint-enforced | Proposed |
| ADR-012 | Transactional core vs extractable module tiering | **APPROVED** 2026-08-05 (resolves T-1) |
| ADR-013 | Cost layers as storage of record; valuation as strategy | Proposed |
| ADR-014 | AI layer receives no write port | Proposed |
| ADR-015 | Marketing app separate; shared tokens, not components | **APPROVED** 2026-08-05 |
| ADR-016 | npm workspaces instead of pnpm (C: disk constraint) | Accepted 2026-08-05 |

---

## 20. Risk Register

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| R-1 | E-invoicing jurisdiction confirmed late | High | FR-TAX-011/012 absorb it by configuration + plugin |
| R-2 | Formula sandbox escape | **Critical** | Custom grammar, no JS execution primitive, penetration test at Phase 1 gate |
| R-3 | Cross-tenant leakage | **Critical** | RLS at database layer + automated breach tests every build |
| R-4 | Valuation method (ASSUMED-02) wrong | High | Confirm before Phase 2. Cost rises sharply once transactions exist. |
| R-5 | Cost engine inaccurate vs reality | High | OPEN-06: the estimator's existing spreadsheet is the calibration source |
| R-6 | RTL retrofitted late | Medium | Logical properties enforced from Phase 1; RTL visual regression from day one |
| R-7 | Scope breadth vs delivery | High | Strict phase gates; each phase independently useful |
| R-8 | Penalty module non-compliant with labour law | **High — legal** | LEGAL-01: configurable ceilings, approval, notification; client obtains counsel confirmation before go-live |
| R-9 | LIFO enabled on an IFRS/EAS-reporting company | **High — compliance** | Disabled by default; persistent warning at configuration (FR-INV-012e); LIFO-1 asks whether it is wanted at all |
| R-10 | Cost-layer model expands Phase 2 scope | Medium | Accepted deliberately — retrofitting FIFO onto WAC-only storage is worse. §10.1. |
| R-11 | T-1 unresolved before Phase 2 | High | ADR-012 blocks Phase 2 start; module boundaries cannot be drawn without it |

---

## 21. Public Marketing Surface

Added by the Marketing Website Directive (2026-08-05). Design detail in [07_UI_UX](07_UI_UX.md).

### 21.1 ADR-015 — Separate app, separate component layer, shared tokens

**Status:** PROPOSED

`apps/marketing` is a distinct Next.js application. It shares `packages/brand` (tokens) with the ERP and shares **no component code** — the cinematic layer (`ui-market`) and the dense layer (`ui-erp`) have opposed performance and interaction requirements.

**The binding consequence:** the three.js, GSAP, and R3F runtime lives in `ui-market` and is imported by `apps/marketing` alone. **No ERP route may ever import it.** Enforced by the same lint boundary rule that keeps the domain layer framework-free (§4).

This restates the playbook's first rule — never mount `<Canvas>` in a root layout — as a monorepo-level guarantee rather than a per-component discipline.

### 21.2 Public lead intake — the only unauthenticated write path

The marketing site's purpose is lead generation, so its forms must create CRM leads (FR-CRM-001). This is the **sole unauthenticated write path in the entire system** and is treated accordingly.

```
Public form → dedicated intake endpoint → validation → rate limit
            → queue → CRM lead (unqualified) → domain event → notification
```

| Control | Requirement |
|---|---|
| Surface | One endpoint. Creates unqualified leads. Nothing else, ever. |
| Reach | No access to any other entity, no general API, no direct database access |
| Rate limiting | Per IP and per fingerprint, stricter than any authenticated endpoint |
| Validation | Strict schema; reject rather than coerce |
| Spam | Bot mitigation that does not degrade accessibility |
| Tenancy | Writes to exactly one designated tenant — the operating company |
| Isolation | Asynchronous via queue, so intake load cannot affect ERP transaction processing |
| Audit | Every submission logged with source, honouring FR-IAM-010 |
| PII | Submitted personal data encrypted at rest (NFR-14) from the moment of capture |

**Rationale for the queue hop:** a marketing campaign or a bot flood must never contend with invoice posting for database connections. The public surface is deliberately decoupled from the transactional core (ADR-012).

### 21.3 Deployment note

**[GAP]** The reference workspace contains **0 Dockerfiles** and no hosting configuration — measured. No deployment target is inherited for either surface. `OPEN-38` tracks the marketing host; the ERP topologies in §16 remain proposals until a target is chosen.

---

## 22. Change Log

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-08-05 | Initial architecture. 11 ADRs; ADR-001 and ADR-002 require approval. |
| 1.1 | 2026-08-05 | Constitution v1.0 applied. ADR-002 ratified by Art. 11. ADR-012 (module tiering) added to resolve T-1; ADR-013 (cost layers) and ADR-014 (AI no write port) added. §10.1 valuation architecture; §13 security controls made explicit; §15 AI boundary hardened. Risks R-9…R-11 added. |
| 1.2 | 2026-08-05 | Marketing Website Directive applied. §21 public marketing surface; ADR-015 (separate app, shared tokens); public lead-intake boundary defined as the sole unauthenticated write path; monorepo gains `apps/marketing`, `packages/brand`, `ui-erp`, `ui-market`. |
