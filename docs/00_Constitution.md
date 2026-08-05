# 00 — Project Constitution

**Version:** 1.0
**Ratified:** 2026-08-05
**Status:** BINDING — overrides all implementation decisions
**Authority:** Highest. Where any document conflicts with this one, this one wins.

---

## Preamble

These sixteen articles are the permanent architecture rules of the system. They are not requirements — requirements can be renegotiated. These are constraints that every future decision is checked against.

Amendment requires an explicit client directive and a new version of this document.

---

## The Articles

### Article 1 — Clean Architecture
Four layers: Presentation, Application, Domain, Infrastructure. Dependencies point inward only.
**Business logic must never exist inside UI components.**

### Article 2 — Domain-Driven Design
Nine independent business domains: **CRM, Sales, Inventory, Manufacturing, Accounting, HR, Reporting, Notifications, Settings.**

### Article 3 — Modular Monolith
First release is a modular monolith. Every module must remain extractable as a microservice. Modules are never tightly coupled.

### Article 4 — Event-Driven
Every significant action publishes a domain event. Events feed reporting, notifications, and AI.

### Article 5 — Cost Engine
The heart of the system. No hardcoded formulas. Every formula configurable from the Admin Panel, versioned, traceable. **Every cost must explain where it came from.**

### Article 6 — Formula Engine
**`eval()` and `new Function()` are prohibited.** Expression parser + AST. Supports arithmetic, functions, variables, constants, conditionals, unit conversion, percentages, versioning, validation, testing, history, and approval.

### Article 7 — Product Model
Hybrid products. One product may combine printing, embroidery, manufacturing, purchased components, packaging, and accessories. Unlimited production stages.

### Article 8 — BOM
Multi-level, variant, size-dependent, colour-dependent. Revision history, effective date, version control, alternative materials, waste percentage, machine time, labour time, quality inspection.

### Article 9 — Inventory Valuation
**Weighted Average, FIFO, LIFO (optional), and Specific Cost.** Method configurable per company.

### Article 10 — Automatic Accounting
Every financial transaction generated automatically. **No duplicate bookkeeping.** Inventory movement, production order, purchase, sale, return, expense, and penalty all post entries automatically.

### Article 11 — Security
RBAC, permission matrix, row-level security, audit log, activity log, encrypted passwords, backups, **restore**, session management, API rate limiting, CSRF, XSS, and SQL-injection protection.

### Article 12 — Multi-Tenancy
One codebase serves Cloud SaaS, On-Premise, Single-Tenant, and Multi-Tenant.

### Article 13 — Reporting
Every module exposes KPIs. Every dashboard supports drill-down. Every report exports PDF, Excel, and CSV.

### Article 14 — AI Boundary
**The AI layer must never directly modify business data.** AI provides predictions, recommendations, insights, forecasts, anomalies, and decision support — advisory output only.

### Article 15 — Documentation Currency
Every completed module updates: SRS, Architecture, Database, API, **Workflow**, Permissions, and **Testing**. Documentation must never become outdated.

### Article 16 — Technical Debt Stop Rule
**Never continue implementation if a design decision introduces technical debt.** Stop, write the ADR, explain the impact, and wait for approval.

---

## Compliance Status of Existing Design

| Article | Status | Evidence |
|---|---|---|
| 1 Clean Architecture | **Already compliant** | [03_Architecture](03_System_Architecture.md) §4, lint-enforced boundaries, NFR-19 |
| 2 DDD | **Amended** | §4 below — 3 domains added |
| 3 Modular monolith | **Already compliant** | ADR-004; see tension T-1 below |
| 4 Event-driven | **Already compliant** | Architecture §6; FR-AIL-001 |
| 5 Cost engine | **Already compliant** | FR-CST-010…014; Cost Sheet derivation tree |
| 6 Formula engine | **Amended** | Sandbox already specified; 6 capabilities added — §4 below |
| 7 Product model | **Already compliant** | FR-MDM-001…003; Hybrid archetype |
| 8 BOM | **Amended** | Alternative materials + effective dating added |
| 9 Valuation | **CHANGED** | Supersedes ASSUMED-02 — see §3, the largest change |
| 10 Auto accounting | **Already compliant** | FR-FIN-004/005, DI-8 |
| 11 Security | **Amended** | 5 controls made explicit |
| 12 Multi-tenancy | **Already compliant** | ADR-002 — Article 11's RLS clause ratifies it |
| 13 Reporting | **Already compliant** | FR-RPT-001…012 |
| 14 AI boundary | **Amended** | Read-only constraint now absolute |
| 15 Doc currency | **Conflict** | See tension T-2 below |
| 16 Debt stop rule | **Adopted** | Governs this document's §5 |

**11 of 16 articles were already satisfied by the v1.0 design. 1 changes it materially. 4 extend it. 1 conflicts and needs resolution.**

---

## 3. Article 9 — the material change

Supersedes ASSUMED-02 (Weighted Average default) and closes **OPEN-26**.

This is not a configuration flag. Weighted Average and the other three methods require **structurally different inventory data**:

| Method | What the database must hold |
|---|---|
| Weighted Average | One running average cost per item/warehouse. Cheap. |
| **FIFO** | **Cost layers** — every receipt is a layer with quantity and unit cost; issues consume oldest-first and split layers |
| **LIFO** | Same layer structure, consumed newest-first |
| **Specific Cost** | Cost carried per individual lot or serial; issue must name the exact unit |

Supporting all four means **building the cost-layer model from the start**, since WAC-only storage cannot be upgraded to FIFO without reconstructing history from the movement log — feasible only because DA-2 makes stock derivable from movements, and expensive regardless.

**Consequence:** inventory valuation becomes a strategy behind a port, exactly like costing (Article 5). Estimated additional Phase 2 effort: significant, and unavoidable. Better paid now than retrofitted.

### ⚠ LIFO — a compliance warning

**LIFO is prohibited under IFRS (IAS 2).** Egyptian Accounting Standards are IFRS-aligned. A company valuing inventory by LIFO cannot produce IFRS-compliant statements.

You marked it optional, which is the right call — the capability can exist. But I am recording, before it is built, that **enabling LIFO for a company subject to IFRS or EAS would make its financial statements non-compliant.** Recommendation: build it, gate it behind an explicit warning at company configuration, and default it off. Confirm you want it at all — it is the one item in Article 9 with no legitimate use in this market.

---

## 4. Articles that extend the design

### Article 2 — three domains added

CRM, Sales, Inventory, Manufacturing, Accounting, and Reporting already map to existing modules. **Newly mandated:**

| Domain | New module | Note |
|---|---|---|
| **HR** | `HRM` | Partially closes OPEN-30. Employee master, org structure, and discipline records are now in scope. **Payroll computation remains out** — FR-DMG-012 exports deductions; it does not calculate wages. Confirm. |
| **Notifications** | `NTF` | Was implicit; now a first-class domain with its own bounded context |
| **Settings** | `STG` | Configuration as a governed domain — tax rules, formulas, valuation method, sequences, feature flags |

### Article 6 — formula engine capabilities added

Already specified: AST parsing, no `eval`, versioning, validation, testing, history.
**Added:** constants, **unit conversion** (critical — substrates convert m²↔sheet↔roll inside formulas), **percentages** as a first-class type, and **formula approval workflow** (a formula now needs approval before activation, not merely validation).

### Article 8 — BOM capabilities added

**Alternative materials** — a BOM line may name substitutes with a selection rule, so production continues when the primary material is out of stock, with the cost sheet recording which was actually used.
**Effective dating** — a BOM revision becomes active on a date, allowing scheduled changes.

### Article 11 — security controls made explicit

Rate limiting, CSRF, XSS, and SQL-injection protections were implied by NFR-15 (OWASP). They are now named requirements with named tests. **Restore** is added alongside backup — an untested restore is not a backup, so restore becomes a scheduled, verified drill.

### Article 14 — AI boundary hardened

Previously the AI layer was optional and permission-respecting. It is now **structurally read-only**: the AI layer receives no write port at all. It cannot post entries, adjust stock, or change master data even if a future feature wanted it to. Enforced by architecture, not policy.

---

## 5. Unresolved tensions — raised under Article 16

Article 16 requires stopping and documenting when a decision creates debt. Two do.

### T-1 — Article 3 vs Article 10

**Article 3** requires every module to be extractable as a microservice.
**Article 10** requires a sale to automatically and reliably produce inventory movements and accounting entries.

These pull in opposite directions. A sale that atomically updates stock and posts to the GL is a single database transaction. If Accounting is extracted to a separate service, that transaction becomes distributed — requiring eventual consistency, sagas, and compensating entries. **A financial ledger that is eventually consistent can show an out-of-balance trial balance during the window.**

**Proposed resolution (ADR-012):** classify module boundaries into two tiers.

| Tier | Modules | Property |
|---|---|---|
| **Transactional core** | Inventory, Manufacturing, Accounting, Cost | Share one database transaction. Extractable only together, never individually. |
| **Extractable** | CRM, Sales, Reporting, Notifications, AI, HR | Communicate by domain events. Independently extractable. |

Both tiers keep strict module boundaries and event publication, satisfying Article 3's intent — no tight coupling — while Article 10's guarantee of correct, immediate bookkeeping is preserved.

**This needs your approval.** The alternative — full independent extractability including Accounting — is achievable, but it means accepting eventual consistency in the ledger, and I do not recommend it for financial data.

### T-2 — Article 15 vs the governed document set

Article 15 requires seven document types updated per module: SRS, Architecture, Database, API, **Workflow**, Permissions, **Testing**.

The governed set has eight numbered documents. Workflow and Testing have no home; Vision, UI/UX, and Roadmap are not in Article 15's list.

**Proposed resolution:** extend the set to ten.

| Doc | Article 15 mapping |
|---|---|
| 00_Constitution | — (this document) |
| 01_Project_Vision | — |
| 02_SRS | SRS |
| 03_System_Architecture | Architecture |
| 04_Database_Design | Database |
| 05_User_Roles | Permissions |
| 06_API_Design | API |
| 07_UI_UX | — |
| 08_Development_Roadmap | — |
| **09_Workflows** | **Workflow** |
| **10_Testing_Strategy** | **Testing** |

Confirm and I will treat ten documents as the governed set.

---

## 6. Amendments Made to Other Documents

| Document | Change |
|---|---|
| [02_SRS](02_SRS.md) | → v1.1: 3 modules added; Article 9 valuation FRs; formula, BOM, security, AI amendments; OPEN-26 closed |
| [03_System_Architecture](03_System_Architecture.md) | → v1.1: valuation strategy; ADR-012 tiering; AI read-only enforcement |

---

## 7. Change Log

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-08-05 | Constitution ratified. 16 articles binding. 11 already satisfied, 1 material change (Article 9), 4 extensions, 2 tensions raised for resolution. |
