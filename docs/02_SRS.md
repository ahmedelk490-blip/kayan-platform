# 02 — Software Requirements Specification

**System:** Enterprise ERP — Printing, Embroidery, Uniforms & Safety Products
**Version:** 1.1
**Date:** 2026-08-05
**Status:** BASELINE — approved for architecture; implementation gated per §14
**Governed by:** [00_Constitution](00_Constitution.md) v1.0 — binding, overrides this document on conflict
**Supersedes:** `SRS.md` v0.1 (Intake Edition), now removed

---

## 1. Introduction

### 1.1 Purpose

Defines the functional and non-functional requirements for a commercial multi-tenant ERP serving printing, embroidery, uniform manufacturing, and safety-product businesses.

### 1.2 Baseline

Version 0.1 logged 30 open questions and **zero** functional requirements. The client directive of 2026-08-05 answered the foundational set. This version drafts the requirement baseline.

**Measured status:**

| Category | Count |
|---|---:|
| Functional requirements drafted | 219 |
| Non-functional requirements | 22 |
| Open questions closed by directive | 11 of 30 |
| Open questions remaining | 19 |
| — of which blocking implementation | 3 |
| Assumptions adopted to unblock progress | 5 |
| Constitution articles traced | 16 of 16 |

Per the client instruction to proceed, the 6 assumptions in §13 are **documented, not silent**. Each is reversible at stated cost.

### 1.3 Marker convention

**[ESTABLISHED]** client-directed · **[PROPOSED]** awaiting approval · **[ASSUMED-nn]** proceeding under §13 · **[OPEN-nn]** unresolved · **[GAP]** known absence

### 1.4 Requirement ID scheme

`FR-<MODULE>-<nnn>` — e.g. `FR-CST-004`. Priority: **M** must / **S** should / **C** could (MoSCoW). Phase per [08_Development_Roadmap](08_Development_Roadmap.md).

---

## 2. Foundation Directives [ESTABLISHED]

Ratified 2026-08-05; changes require a new SRS version.

| # | Directive |
|---|---|
| D-01 | Dual deployment — multi-tenant SaaS **and** dedicated on-premise, from one codebase |
| D-02 | Multi-tenant by design; single-tenant is a deployment configuration, not a fork |
| D-03 | No country's tax rules compiled into the product. Configurable tax engine. |
| D-04 | Base currency EGP; unlimited currencies |
| D-05 | Unlimited companies, branches, warehouses |
| D-06 | Six product archetypes incl. Hybrid |
| D-07 | Every product has a configurable manufacturing recipe (BOM) |
| D-08 | Recipes support size- and colour-dependent consumption |
| D-09 | All production formulas editable from the Admin Panel |
| D-10 | Every cost calculation must be traceable |
| D-11 | Complete accounting from day one |
| D-12 | Enterprise RBAC, audit logs, activity logs, encrypted credentials, backups, session management |
| D-13 | AI-ready architecture from the beginning |
| D-14 | Documentation precedes implementation, always |

---

## 3. System Scope

### 3.1 Module inventory

| Code | Module | Phase |
|---|---|---|
| PLT | Platform & Tenancy | 1 |
| IAM | Identity & Access Management | 1 |
| MDM | Master Data (products, partners, UoM) | 3 |
| INV | Inventory & Warehousing | 2 |
| MFG | Manufacturing & Production | 5 |
| CST | Cost Engine | 5 |
| FRM | Formula Engine | 4 |
| PUR | Purchasing & Supply | 4 |
| CRM | CRM & Sales | 4 |
| FIN | Finance & Accounting | 2 |
| TAX | Tax Engine | 2 |
| STG | Settings & Configuration | 1 |
| NTF | Notifications | 4 |
| HRM | Human Resources | 6 |
| DMG | Damage, Penalties & Discipline | 6 |
| RPT | Reporting & Analytics | 6 |
| ECM | E-commerce & Customer Portal | 7 |
| AIL | AI Layer | 8 |

**18 modules.** Build order and rationale in §12.

STG, NTF, and HRM were added by Constitution Article 2, which names nine binding business domains. Domain-to-module mapping:

| Constitution domain | Module(s) |
|---|---|
| CRM · Sales | CRM |
| Inventory | INV |
| Manufacturing | MFG · CST · FRM |
| Accounting | FIN · TAX |
| HR | HRM · DMG |
| Reporting | RPT |
| Notifications | NTF |
| Settings | STG |

---

## 4. Actors

| Actor | Description |
|---|---|
| Super Administrator | Tenant provisioning, platform config (SaaS operator) |
| Company Administrator | Config within one company |
| Sales Representative | Leads, quotes, orders |
| Estimator | Job costing across archetypes |
| Pre-press / Designer | Artwork, proofs, approvals |
| Digitiser | Embroidery file library |
| Production Planner | Scheduling and capacity |
| Machine Operator | Shop-floor execution |
| QC Inspector | Quality gates, PPE inspection |
| Store Keeper | Receipts, issues, counts |
| Purchasing Officer | Suppliers, POs, landed cost |
| Accountant | GL, AR/AP, tax |
| Financial Controller | Margin analysis, period close |
| HR Officer | Penalty approval, employee records |
| CEO / Executive | Dashboards, KPIs |
| Customer | Portal: order, approve artwork, track |
| System (automated) | Scheduled jobs, integrations |

**17 actors.** Permission matrix in [05_User_Roles](05_User_Roles.md).

---

## 5. Functional Requirements

### 5.1 PLT — Platform & Tenancy

| ID | Pri | Requirement |
|---|---|---|
| FR-PLT-001 | M | Support unlimited tenants, isolated so no tenant can read another's data under any code path |
| FR-PLT-002 | M | Isolation enforced at the database layer, not application layer alone |
| FR-PLT-003 | M | Identical build runs SaaS multi-tenant and on-premise single-tenant, selected by configuration |
| FR-PLT-004 | M | Unlimited companies per tenant, each with independent CoA, currency, fiscal calendar and tax profile |
| FR-PLT-005 | M | Unlimited branches per company, each linked to a cost centre |
| FR-PLT-006 | M | Unlimited warehouses per branch |
| FR-PLT-007 | M | Inter-company transactions with automatic reciprocal entries |
| FR-PLT-008 | M | Full Arabic and English UI; per-user language preference |
| FR-PLT-009 | M | RTL mirroring of layout, icons, charts, and generated PDFs |
| FR-PLT-010 | M | Per-company fiscal year definition with independent period open/close |
| FR-PLT-011 | M | Tenant-level feature flags to enable/disable modules |
| FR-PLT-012 | S | Tenant-level branding (logo, colours, document templates) |
| FR-PLT-013 | M | All user-facing master data translatable (item names, categories, UoM) |
| FR-PLT-014 | M | Per-company number sequences, configurable format, gapless for fiscal documents |

### 5.2 IAM — Identity & Access

| ID | Pri | Requirement |
|---|---|---|
| FR-IAM-001 | M | Password auth with configurable policy (length, complexity, history, expiry) |
| FR-IAM-002 | M | Passwords stored using Argon2id. Never reversible, never logged. |
| FR-IAM-003 | M | MFA (TOTP), enforceable per role |
| FR-IAM-004 | M | RBAC: users → roles → permissions; deny by default |
| FR-IAM-005 | M | Record-level scoping by company, branch, warehouse, customer segment |
| FR-IAM-006 | M | Field-level permissions — specifically cost and margin fields hidden from unauthorised roles |
| FR-IAM-007 | M | Custom roles definable by Company Administrator |
| FR-IAM-008 | M | Session management: list active sessions, revoke individually or all |
| FR-IAM-009 | M | Configurable idle and absolute session timeout |
| FR-IAM-010 | M | Immutable audit log of every create, update, delete on financial and inventory entities: actor, timestamp, before/after, IP, request ID |
| FR-IAM-011 | M | Activity log of user actions (logins, views of sensitive data, exports) |
| FR-IAM-012 | M | Account lockout after configurable failed attempts |
| FR-IAM-013 | S | SSO via OIDC/SAML |
| FR-IAM-014 | M | Approval-delegation: a user may delegate approval authority for a bounded period, logged |
| FR-IAM-015 | M | Segregation of duties: configurable rules preventing one user from both creating and approving the same document class |

### 5.3 MDM — Master Data

| ID | Pri | Requirement |
|---|---|---|
| FR-MDM-001 | M | Item master supporting six archetypes: Printing, Embroidery, Uniform, Safety, Custom, Hybrid |
| FR-MDM-002 | M | Archetype-specific attributes held in extension records, not nullable columns on a shared table |
| FR-MDM-003 | M | A Hybrid item carries two or more archetype extensions simultaneously |
| FR-MDM-004 | M | Variant matrix: style × size × colour, generating individually stockable SKUs |
| FR-MDM-005 | M | Multi-UoM per item with conversion factors (purchase, stock, sales, production UoM) |
| FR-MDM-006 | M | Area- and weight-based UoM for substrates (sheet, roll, m², linear m, kg) |
| FR-MDM-007 | M | SKU, barcode (EAN/UPC/Code128), and QR code per variant; QR encodes item + lot + serial where applicable |
| FR-MDM-008 | M | PPE certification attributes: standard reference (EN/ANSI/ISO), notified body, certificate document, validity dates |
| FR-MDM-009 | M | Certification data printable on quotations, delivery notes, and invoices |
| FR-MDM-010 | M | Embroidery design library: digitised file, version history, stitch count, thread colour sequence, run time |
| FR-MDM-011 | M | A design is reusable across unlimited orders and customers, with ownership/exclusivity flags |
| FR-MDM-012 | M | Artwork library with version history and customer approval state |
| FR-MDM-013 | M | Business partners as unified records that may be customer, supplier, or both |
| FR-MDM-014 | M | Partner hierarchy (parent company → subsidiaries) with consolidated credit and reporting |
| FR-MDM-015 | M | Price lists by customer, segment, currency, and validity window |
| FR-MDM-016 | M | Quantity-break pricing with non-linear tiers |
| FR-MDM-017 | M | Thread and ink colour catalogues as controlled vocabularies with manufacturer codes |
| FR-MDM-018 | S | Item images and technical datasheets |
| FR-MDM-019 | M | Item lifecycle states (draft, active, discontinued) blocking transactions when inactive |

### 5.4 INV — Inventory & Warehousing

| ID | Pri | Requirement |
|---|---|---|
| FR-INV-001 | M | Unlimited warehouses, each with an address, type, and responsible user |
| FR-INV-002 | M | Optional bin/location structure within a warehouse |
| FR-INV-003 | M | Real-time stock by item, variant, warehouse, bin, lot, and serial |
| FR-INV-004 | M | Batch/lot tracking with manufacture date, supplier, and cost |
| FR-INV-005 | M | Expiry-date tracking per lot; block sale/issue of expired stock; configurable near-expiry alerts **[ASSUMED-01]** |
| FR-INV-006 | M | Serial-number tracking, enabled per item |
| FR-INV-007 | M | Bidirectional traceability: lot → all customers who received it, and customer complaint → lot → supplier |
| FR-INV-008 | M | Recall execution: select a lot, produce the full recipient list with contact details and quantities |
| FR-INV-009 | M | Every stock movement generates an immutable ledger entry; stock is derived from movements, never overwritten |
| FR-INV-010 | M | Movement types: receipt, issue, transfer, adjustment, production consumption, production output, return, scrap |
| FR-INV-011 | M | Automatic movement generation from purchase receipt, sales delivery, production, and damage events |
| FR-INV-012 | M | Stock valuation supporting **Weighted Average, FIFO, LIFO, and Specific Cost**, configurable per company (Constitution Art. 9) |
| FR-INV-012a | M | Cost-layer model: every receipt creates a layer carrying quantity, unit cost, date, lot, and source document |
| FR-INV-012b | M | FIFO consumes layers oldest-first; LIFO newest-first; layer splitting on partial consumption |
| FR-INV-012c | M | Specific Cost carries cost per lot or serial; issue must identify the exact unit consumed |
| FR-INV-012d | M | Valuation method is set once per company at configuration and cannot be changed after the first posted transaction without an explicit, audited revaluation procedure |
| FR-INV-012e | M | **LIFO is disabled by default and, when enabled, displays a persistent IFRS/EAS non-compliance warning at company configuration** (Constitution §3) |
| FR-INV-012f | M | Every issue records which layers it consumed, making unit cost traceable to the originating receipt |
| FR-INV-013 | M | Every stock movement posts a corresponding GL entry; inventory sub-ledger reconciles to GL control account at all times |
| FR-INV-014 | M | Reorder level, reorder quantity, and safety stock per item per warehouse |
| FR-INV-015 | M | Low-stock alerts and a replenishment suggestion list |
| FR-INV-016 | M | Stock reservation against confirmed sales and work orders; available-to-promise = on hand − reserved |
| FR-INV-017 | M | Inter-warehouse transfer with in-transit state |
| FR-INV-018 | M | Physical stock count (full and cycle) with variance report and approval before posting |
| FR-INV-019 | M | Barcode/QR scanning for receipt, issue, transfer, and count |
| FR-INV-020 | M | Negative stock blocked by default; override permissioned and logged |
| FR-INV-021 | S | Landed-cost allocation (freight, customs, insurance) across received items by value or weight |
| FR-INV-022 | S | Stock ageing report |
| FR-INV-023 | M | PPE periodic-inspection scheduling per serial, with due/overdue register **[ASSUMED-03]** |

### 5.5 FRM — Formula Engine

Underpins D-09 (admin-editable formulas) and D-10 (traceability). Detailed design in [03_System_Architecture](03_System_Architecture.md) §8.

| ID | Pri | Requirement |
|---|---|---|
| FR-FRM-001 | M | Administrators define calculation formulas through the Admin Panel without code deployment |
| FR-FRM-002 | M | Formulas are evaluated in a sandbox with no filesystem, network, or host access |
| FR-FRM-003 | M | Only a documented whitelist of variables and functions is available to a formula |
| FR-FRM-004 | M | Formulas are versioned; editing creates a new version and never mutates the prior one |
| FR-FRM-005 | M | Every calculated document stores the formula **version id** it used |
| FR-FRM-006 | M | Recalculating a historical document reproduces the original result exactly |
| FR-FRM-007 | M | Formula editor provides validation, a variable browser, and a live test harness with sample inputs |
| FR-FRM-008 | M | A formula failing validation cannot be activated |
| FR-FRM-009 | M | Evaluation is bounded in time and memory; runaway formulas are terminated |
| FR-FRM-010 | M | Full change history: who edited, when, before/after, and why (mandatory comment) |
| FR-FRM-011 | M | Formulas scoped per tenant, company, product archetype, or individual item |
| FR-FRM-012 | M | All monetary arithmetic uses exact decimal, never floating point |
| FR-FRM-013 | M | Named constants definable per tenant, company, or archetype and referenced by formulas |
| FR-FRM-014 | M | **Unit conversion within formulas** — substrate m² ↔ sheet ↔ roll ↔ kg resolved using item UoM factors (Constitution Art. 6) |
| FR-FRM-015 | M | **Percentage as a first-class type**, so waste, margin, and markup cannot be silently confused with ratios |
| FR-FRM-016 | M | Conditional expressions with nested conditions |
| FR-FRM-017 | M | **Formula approval workflow** — a validated formula requires approval by an authorised role before activation; validation alone is insufficient (Constitution Art. 6) |
| FR-FRM-018 | M | Formula test harness saves named test cases with expected results; a formula version cannot be approved while any saved test fails |

### 5.6 MFG — Manufacturing & Production

| ID | Pri | Requirement |
|---|---|---|
| FR-MFG-001 | M | Every product may carry a manufacturing recipe (BOM) |
| FR-MFG-002 | M | BOMs are versioned; an active work order pins its BOM version |
| FR-MFG-003 | M | Multi-level BOMs (a component may itself be manufactured) |
| FR-MFG-004 | M | **Size-dependent consumption**: material quantity varies by size variant, via a consumption matrix or formula |
| FR-MFG-005 | M | **Colour-dependent consumption**: quantity and material selection vary by colour variant |
| FR-MFG-006 | M | Waste percentage per BOM line and per production stage |
| FR-MFG-007 | M | BOM lines typed by nature: fabric, printing material, embroidery material, trim, packaging, consumable |
| FR-MFG-008 | M | Routing with multiple ordered production stages |
| FR-MFG-009 | M | Per stage: work centre, setup time, setup cost, run rate, labour rate, machine rate, and optional QC gate |
| FR-MFG-010 | M | Work centres model machines including **embroidery head count** and capacity per shift |
| FR-MFG-011 | M | Work orders generated from sales orders or created independently for stock |
| FR-MFG-012 | M | Work order states: draft → released → in progress → completed → closed, with permissioned transitions |
| FR-MFG-013 | M | **Artwork approval gate**: a work order for an item requiring artwork cannot be released before recorded customer approval |
| FR-MFG-014 | M | Material issue to work order, automatic (backflush) or manual, configurable per BOM |
| FR-MFG-015 | M | Shop-floor terminal: operators view queue, start/stop stages, report good quantity, waste quantity, and downtime |
| FR-MFG-016 | M | Actual consumption, labour time, and machine time recorded against the work order for variance analysis |
| FR-MFG-017 | M | QC inspection at defined gates with pass/fail, defect classification, and quantity disposition (accept, rework, scrap) |
| FR-MFG-018 | M | Rework tracked as a distinct cost stream, never merged into original job cost |
| FR-MFG-019 | M | Production output posts to inventory at computed cost, with GL entries |
| FR-MFG-020 | S | Capacity planning view showing work-centre load against available hours |
| FR-MFG-021 | S | Gang runs: one production run consuming material against multiple sales orders, with defined cost allocation **[OPEN-07]** |
| FR-MFG-022 | S | Subcontracting: issue material to an external vendor, receive finished goods, capture vendor cost **[OPEN-28]** |
| FR-MFG-023 | M | Hybrid routing: one work order spanning printing, embroidery, and assembly stages |
| FR-MFG-024 | M | Real-time work order progress broadcast to subscribed clients |
| FR-MFG-025 | M | **Alternative materials** per BOM line, with a selection rule (availability, cost, or manual), so production proceeds when the primary material is unavailable (Constitution Art. 8) |
| FR-MFG-026 | M | The cost sheet records which alternative was actually consumed, not the primary |
| FR-MFG-027 | M | **Effective dating** on BOM revisions — a revision activates on a date, permitting scheduled changes (Constitution Art. 8) |
| FR-MFG-028 | M | BOM revision history showing what changed, by whom, when, and why |
| FR-MFG-029 | M | Machine time and labour time defined per BOM line as well as per stage |

### 5.7 CST — Cost Engine

Fulfils D-10. **The most critical module in the system.** Architecture in [03_System_Architecture](03_System_Architecture.md) §7.

| ID | Pri | Requirement |
|---|---|---|
| FR-CST-001 | M | Compute, for any item, variant, and quantity: material, labour, printing, embroidery, machine, packaging, and waste cost |
| FR-CST-002 | M | Compute total production cost and cost per unit |
| FR-CST-003 | M | Compute selling price, gross profit, net profit, and profit margin |
| FR-CST-004 | M | A distinct costing strategy per archetype, selected by item type |
| FR-CST-005 | M | Printing strategy models setup cost amortised across run quantity, substrate consumption by area, impressions, and spoilage |
| FR-CST-006 | M | Embroidery strategy models stitch count × head count × machine rate, plus thread, backing, and digitising amortisation |
| FR-CST-007 | M | Uniform strategy models size-dependent fabric consumption, cut/make/trim labour, and trims |
| FR-CST-008 | M | Safety-product strategy models landed purchase cost plus any value-add operations |
| FR-CST-009 | M | Hybrid strategy composes multiple strategies into one cost sheet without double-counting shared overhead |
| FR-CST-010 | M | Every calculation produces an immutable **Cost Sheet** — a persisted derivation tree |
| FR-CST-011 | M | Each cost sheet node records: label, formula version id, input values with sources, intermediate results, and output |
| FR-CST-012 | M | Any figure in the UI can be expanded to reveal its full derivation |
| FR-CST-013 | M | Cost sheets are immutable once issued; recalculation creates a new revision, preserving the prior |
| FR-CST-014 | M | Later edits to formulas, prices, or BOMs never alter an existing cost sheet |
| FR-CST-015 | M | Estimated versus actual variance report per work order, by cost component |
| FR-CST-016 | M | Overhead allocation configurable by rate, percentage, or activity driver |
| FR-CST-017 | M | Quantity-break costing producing a price curve across multiple run lengths in one operation |
| FR-CST-018 | M | Margin computed against a chosen basis (cost, list price, or target margin), with target-margin back-solving to price |
| FR-CST-019 | M | Currency conversion applied at a documented rate with the rate and date recorded in the cost sheet |
| FR-CST-020 | M | All monetary values exact decimal; rounding rules defined per currency and applied at documented points only |

### 5.8 PUR — Purchasing

| ID | Pri | Requirement |
|---|---|---|
| FR-PUR-001 | M | Purchase requisition → RFQ → purchase order → goods receipt → supplier invoice → payment |
| FR-PUR-002 | M | Multi-level PO approval by value threshold |
| FR-PUR-003 | M | Supplier price lists and quotation comparison |
| FR-PUR-004 | M | Goods receipt with lot, expiry, and serial capture; partial receipt supported |
| FR-PUR-005 | M | Three-way match: PO ↔ receipt ↔ supplier invoice, with tolerance rules and exception handling |
| FR-PUR-006 | M | Landed cost capture and allocation to received item cost |
| FR-PUR-007 | M | Purchase returns with debit notes |
| FR-PUR-008 | M | Supplier performance metrics: on-time delivery, quality rejection rate, price variance |
| FR-PUR-009 | M | Automatic requisition suggestion from reorder levels and open demand |
| FR-PUR-010 | M | Foreign-currency purchases with exchange-difference posting |

### 5.9 CRM — CRM & Sales

| ID | Pri | Requirement |
|---|---|---|
| FR-CRM-001 | M | Lead capture, qualification, and conversion to customer |
| FR-CRM-002 | M | Opportunity pipeline with stages, value, probability, and expected close |
| FR-CRM-003 | M | Log every interaction: call, meeting, visit, note, email, task |
| FR-CRM-004 | M | Unified **activity timeline** per customer showing all interactions and all documents chronologically |
| FR-CRM-005 | M | Attachments on any customer record or interaction |
| FR-CRM-006 | M | Tasks with assignee, due date, reminder, and completion state |
| FR-CRM-007 | M | Quotation built on the cost engine, showing margin to authorised roles only |
| FR-CRM-008 | M | Quotation revisions with full version history |
| FR-CRM-009 | M | Quotation → sales order conversion preserving the cost sheet reference |
| FR-CRM-010 | M | Sales order → work order and/or delivery, depending on stock and make/buy |
| FR-CRM-011 | M | **Staged/partial delivery** against a single order with scheduled delivery lines **[ASSUMED-04]** |
| FR-CRM-012 | M | **Per-employee size roster** for corporate uniform contracts: employee name, size, and personalisation, driving production **[ASSUMED-05]** |
| FR-CRM-013 | M | Delivery note generation and stock issue |
| FR-CRM-014 | M | Sales invoice from order or delivery, with tax computed by the tax engine |
| FR-CRM-015 | M | Credit limit per customer with configurable enforcement (warn or block) |
| FR-CRM-016 | M | Sales returns with credit notes and stock return |
| FR-CRM-017 | M | Customer artwork approval workflow with recorded decision, timestamp, and approver identity |
| FR-CRM-018 | M | Commission calculation per representative, configurable basis |
| FR-CRM-019 | S | Recurring/contract orders generating scheduled releases |

### 5.10 FIN — Finance & Accounting

| ID | Pri | Requirement |
|---|---|---|
| FR-FIN-001 | M | Multi-level Chart of Accounts per company, with a configurable starting template **[ASSUMED-06]** |
| FR-FIN-002 | M | Double-entry journal entries; unbalanced entries cannot post |
| FR-FIN-003 | M | Posted entries are immutable. Correction is by reversing entry only. No update, no delete, ever. |
| FR-FIN-004 | M | Automatic journal generation from every sub-ledger event (sales, purchase, inventory, production, payroll deduction, damage) |
| FR-FIN-005 | M | Every posting traceable to its source document and back |
| FR-FIN-006 | M | Cash and bank accounts with receipts, payments, and transfers |
| FR-FIN-007 | M | Bank reconciliation with statement import |
| FR-FIN-008 | M | Accounts receivable: ageing, statements, dunning, allocation of receipts to invoices |
| FR-FIN-009 | M | Accounts payable: ageing, payment scheduling, allocation |
| FR-FIN-010 | M | Expense recording with category, cost centre, and attachment |
| FR-FIN-011 | M | Fixed asset register with depreciation **[OPEN-30]** |
| FR-FIN-012 | M | Cost centres and profit centres, with the four product lines reportable independently |
| FR-FIN-013 | M | Unlimited currencies with dated exchange rates |
| FR-FIN-014 | M | Realised and unrealised FX gain/loss computed and posted |
| FR-FIN-015 | M | Fiscal period open/close; posting to a closed period blocked |
| FR-FIN-016 | M | Year-end closing with retained-earnings roll-forward |
| FR-FIN-017 | M | Trial balance, always balanced |
| FR-FIN-018 | M | Profit & Loss, Balance Sheet, and Cash Flow statements |
| FR-FIN-019 | M | Comparative reporting (period vs period, actual vs budget) |
| FR-FIN-020 | M | Budgets per account, cost centre, and period, with variance reporting |
| FR-FIN-021 | M | Drill-down from any statement line to journal entries to source documents |
| FR-FIN-022 | S | Consolidated multi-company reporting with inter-company elimination |

### 5.11 TAX — Tax Engine

Fulfils D-03. No jurisdiction compiled into the product.

| ID | Pri | Requirement |
|---|---|---|
| FR-TAX-001 | M | Tax types, rates, and rules defined as configuration data, never code |
| FR-TAX-002 | M | Multiple concurrent taxes on one line (VAT, withholding, schedule tax, stamp duty) |
| FR-TAX-003 | M | Tax determination by combination of jurisdiction, customer class, item class, and transaction type |
| FR-TAX-004 | M | Rates carry validity date ranges; historical documents use the rate effective at document date |
| FR-TAX-005 | M | Inclusive and exclusive tax calculation, per company and per document |
| FR-TAX-006 | M | Tax exemption per customer or item, with recorded certificate reference |
| FR-TAX-007 | M | Withholding tax on supplier payments |
| FR-TAX-008 | M | Reverse charge |
| FR-TAX-009 | M | Configurable rounding per tax and per currency |
| FR-TAX-010 | M | Tax return reporting by period, showing input and output tax with drill-down |
| FR-TAX-011 | M | Documents carry an extensible attribute set so jurisdiction-specific fields are added by configuration, not schema change |
| FR-TAX-012 | S | Pluggable e-invoicing adapter interface, so a jurisdiction integration (e.g. Egypt ETA, KSA ZATCA) is a plugin, not a core change **[OPEN-05a]** |

### 5.12 DMG — Damage, Penalties & Discipline

| ID | Pri | Requirement |
|---|---|---|
| FR-DMG-001 | M | Record a damage event against item, variant, lot, quantity, warehouse, and work order where applicable |
| FR-DMG-002 | M | Capture reason from a configurable classification list |
| FR-DMG-003 | M | Attribute the event to an employee where applicable |
| FR-DMG-004 | M | Attach images and documents as evidence |
| FR-DMG-005 | M | Compute damage cost from current valuation and post to the GL |
| FR-DMG-006 | M | Damage reduces stock via a scrap movement |
| FR-DMG-007 | M | Optional penalty proposal against the responsible employee |
| FR-DMG-008 | M | Penalties require a documented multi-step approval before taking effect |
| FR-DMG-009 | M | **Configurable statutory ceilings** on penalty value — per event, per month, and as a percentage of wage — enforced by the system **[LEGAL-01]** |
| FR-DMG-010 | M | Employee notification and recorded acknowledgement before a penalty is applied **[LEGAL-01]** |
| FR-DMG-011 | M | Employee right of objection recorded against the penalty |
| FR-DMG-012 | M | Approved penalties post as a deduction record for payroll consumption; this system does not compute payroll |
| FR-DMG-013 | M | Full audit trail: who proposed, who approved, when, and on what evidence |
| FR-DMG-014 | M | Damage and penalty analytics by employee, machine, shift, reason, and product |

### 5.13 RPT — Reporting & Analytics

| ID | Pri | Requirement |
|---|---|---|
| FR-RPT-001 | M | Every module exposes standard reports with filter, sort, group, and export (PDF, XLSX, CSV) |
| FR-RPT-002 | M | Reports honour the requesting user's record- and field-level permissions |
| FR-RPT-003 | M | **CEO Dashboard**: sales, expenses, production cost, net profit, inventory value, low stock, customer growth, best products, employee performance, financial KPIs |
| FR-RPT-004 | M | Dashboard filters by company, branch, product line, and period |
| FR-RPT-005 | M | Every dashboard figure drills through to its underlying transactions |
| FR-RPT-006 | M | Profitability analysis by job, product, product line, customer, and representative |
| FR-RPT-007 | M | Estimated vs actual production cost variance |
| FR-RPT-008 | M | Machine utilisation and operator productivity |
| FR-RPT-009 | M | Scheduled report delivery by email |
| FR-RPT-010 | S | User-defined report builder |
| FR-RPT-011 | M | Analytical queries served without degrading transactional performance |
| FR-RPT-012 | M | Arabic and English report rendering, including RTL PDF layout |

### 5.14 ECM — E-commerce & Customer Portal

Scope split unresolved — **[OPEN-31]**. Requirements below are provisional.

| ID | Pri | Requirement |
|---|---|---|
| FR-ECM-001 | M | Authenticated B2B customer portal |
| FR-ECM-002 | M | Portal: order history, document download, outstanding balance |
| FR-ECM-003 | M | Portal: artwork proof review with approve/reject and comments, feeding FR-MFG-013 |
| FR-ECM-004 | M | Portal: reorder from history |
| FR-ECM-005 | M | Portal: order and production status tracking |
| FR-ECM-006 | S | Public B2C storefront with catalogue, cart, and checkout |
| FR-ECM-007 | S | Online payment integration |
| FR-ECM-008 | M | Portal shares one product, pricing, and stock source with the ERP — no separate catalogue |

### 5.15 AIL — AI Layer

Fulfils D-13. Use cases unresolved — **[OPEN-32]**. This phase delivers *readiness*, not features.

| ID | Pri | Requirement |
|---|---|---|
| FR-AIL-000 | M | **The AI layer has no write access to business data under any code path.** It receives no write port. It cannot post entries, adjust stock, alter master data, or approve documents. Enforced architecturally, not by policy. (Constitution Art. 14) |
| FR-AIL-00a | M | AI output is advisory only: predictions, recommendations, insights, forecasts, anomalies, decision support. A human acts on it or does not. |
| FR-AIL-00b | M | Every AI-originated suggestion is labelled as such in the UI and never presented as a system-computed fact |
| FR-AIL-001 | M | All business events published to an append-only event stream consumable by downstream analytics |
| FR-AIL-002 | M | Documents and master data carry stable identifiers and clean text fields suitable for indexing |
| FR-AIL-003 | M | A read-only, permission-respecting data access layer for AI consumers |
| FR-AIL-004 | M | AI features are optional plugins; the ERP is fully functional with the AI layer disabled |
| FR-AIL-005 | M | No customer data leaves the deployment boundary without explicit per-tenant opt-in |
| FR-AIL-006 | S | Demand forecasting from sales and production history |
| FR-AIL-007 | S | Quotation assistance suggesting price from comparable historical jobs |
| FR-AIL-008 | S | Document data extraction (supplier invoices, purchase orders) |

**[GAP]** No AI, RAG, vector, or agent implementation exists in any reference material available to this project. The AI layer is designed from zero and is deliberately last.

### 5.16 STG — Settings & Configuration

Constitution Article 2 elevates Settings to a governed domain. This module is the single home for everything Article 5 and Article 9 require to be configurable rather than coded.

| ID | Pri | Requirement |
|---|---|---|
| FR-STG-001 | M | Central configuration registry scoped by tenant, company, branch, and user, with defined precedence |
| FR-STG-002 | M | Every configuration change is versioned and audited: who, when, before, after, and why |
| FR-STG-003 | M | Configuration changes affecting financial outcomes require approval before taking effect |
| FR-STG-004 | M | Company setup: currency, fiscal calendar, valuation method, tax profile, CoA template |
| FR-STG-005 | M | Document number sequence definition per company and document type |
| FR-STG-006 | M | Feature flags enabling or disabling modules per tenant |
| FR-STG-007 | M | Configurable classification lists (damage reasons, defect types, lead sources, expense categories) |
| FR-STG-008 | M | Configurable approval workflows: document type, threshold, approver role, escalation |
| FR-STG-009 | M | UoM and conversion factor registry consumed by FR-FRM-014 |
| FR-STG-010 | M | Document and label template management, per company, Arabic and English |
| FR-STG-011 | M | Configuration export and import for on-premise provisioning and tenant cloning |
| FR-STG-012 | M | Settings that cannot be changed after first transaction are enforced as immutable, not merely warned about |

### 5.17 NTF — Notifications

| ID | Pri | Requirement |
|---|---|---|
| FR-NTF-001 | M | Notifications generated from domain events (Constitution Art. 4), never by direct module calls |
| FR-NTF-002 | M | Channels: in-app, email, and WebSocket push; per-user, per-event-type preferences |
| FR-NTF-003 | M | Configurable subscription rules by role, event type, and threshold |
| FR-NTF-004 | M | Approval requests delivered as actionable notifications |
| FR-NTF-005 | M | Alert catalogue: low stock, near-expiry, overdue PPE inspection, credit limit breach, overdue receivable, work order delay, QC failure, failed formula evaluation |
| FR-NTF-006 | M | Notifications respect the recipient's record- and field-level permissions; a notification must never leak a figure the recipient cannot see |
| FR-NTF-007 | M | Delivery status tracked; failed deliveries retried with backoff |
| FR-NTF-008 | M | Notification content rendered in the recipient's language (AR/EN) |
| FR-NTF-009 | S | Digest mode batching low-priority notifications |
| FR-NTF-010 | M | Full notification history, queryable and auditable |

### 5.18 HRM — Human Resources

Constitution Article 2 names HR a binding domain, partially closing OPEN-30. **Scope boundary: this module holds employee records and discipline. It does not compute payroll** — FR-DMG-012 exports deductions for a payroll system to consume. Confirmation requested (§14).

| ID | Pri | Requirement |
|---|---|---|
| FR-HRM-001 | M | Employee master: identity, contact, national id, contract type, hire date, status |
| FR-HRM-002 | M | Organisational structure: department, position, reporting line, company, branch |
| FR-HRM-003 | M | Employee linked to a system user where applicable; not every employee has a login |
| FR-HRM-004 | M | Assignment of employees to work centres and shifts, consumed by manufacturing |
| FR-HRM-005 | M | Wage/salary reference data sufficient to enforce penalty ceilings (FR-DMG-009) |
| FR-HRM-006 | M | Employee documents with expiry tracking (contract, medical certificate, safety training) |
| FR-HRM-007 | M | Discipline register: warnings, penalties, and objections, sourced from DMG |
| FR-HRM-008 | M | Employee performance metrics from production: output, waste rate, QC pass rate, downtime |
| FR-HRM-009 | M | Employee PII encrypted at column level and visible only to authorised roles |
| FR-HRM-010 | M | Attendance data ingestion from an external system to support performance metrics **[OPEN-33]** |
| FR-HRM-011 | S | Skills and certification matrix, enabling assignment rules by qualification |

---

## 6. Non-Functional Requirements

| ID | Category | Requirement |
|---|---|---|
| NFR-01 | Localisation | Complete Arabic and English UI, including all system messages and validation text |
| NFR-02 | Localisation | RTL mirroring of layout, navigation, tables, charts, icons, and PDF output |
| NFR-03 | Localisation | Locale-aware dates, numerals, and currency formatting |
| NFR-04 | Usability | Responsive across desktop, tablet, mobile, and shop-floor terminal |
| NFR-05 | Usability | Shop-floor UI usable with gloves on a touch screen: large targets, minimal typing, barcode-driven |
| NFR-06 | Accessibility | WCAG 2.2 AA |
| NFR-07 | Performance | List views p95 < 500 ms at 100,000 rows |
| NFR-08 | Performance | Cost calculation for a single item p95 < 300 ms |
| NFR-09 | Performance | Dashboard initial render p95 < 2 s |
| NFR-10 | Scalability | Horizontal scaling of the application tier without session affinity |
| NFR-11 | Scalability | Designed for 500 concurrent users per tenant **[ASSUMED — OPEN-03]** |
| NFR-12 | Security | Deny-by-default authorisation on every endpoint |
| NFR-13 | Security | Tenant isolation enforced in the database, verified by automated test on every build |
| NFR-14 | Security | TLS in transit; encryption at rest; column-level encryption for PII |
| NFR-15 | Security | OWASP Top 10 mitigations documented and tested |
| NFR-16 | Security | No secret in source control; all configuration by environment or secret store |
| NFR-15a | Security | API rate limiting per tenant, user, and endpoint class (Constitution Art. 11) |
| NFR-15b | Security | CSRF protection on all state-changing requests (Constitution Art. 11) |
| NFR-15c | Security | XSS protection: output encoding, strict Content-Security-Policy, no unsanitised HTML rendering (Constitution Art. 11) |
| NFR-15d | Security | SQL-injection protection: parameterised queries only; raw SQL prohibited by lint rule (Constitution Art. 11) |
| NFR-17 | Reliability | Automated backups with documented, **tested** restore procedure **[OPEN-04]** |
| NFR-17a | Reliability | **Restore is a scheduled, verified drill**, not a documented intention. An untested restore is not a backup. (Constitution Art. 11) |
| NFR-18 | Reliability | Graceful degradation: cache or real-time outage must not stop transaction processing |
| NFR-19 | Maintainability | Clean Architecture; domain layer free of framework and ORM imports |
| NFR-20 | Testability | 100% branch coverage on ledger posting, cost engine, tax engine, and formula evaluation. Non-negotiable. |
| NFR-21 | Observability | Structured logging with correlation IDs, metrics, traces, health endpoints |
| NFR-22 | Portability | One build artefact deployable as SaaS or on-premise; no code branching by deployment mode |

---

## 7. Data Integrity Rules

| # | Rule |
|---|---|
| DI-1 | Financial postings are append-only. No UPDATE, no DELETE. |
| DI-2 | Stock is derived from movements, never stored as a mutable balance of record |
| DI-3 | Monetary values use exact decimal. Floating point is prohibited in financial paths. |
| DI-4 | Every document carries a tenant id, enforced by database policy |
| DI-5 | Cost sheets and their formula versions are immutable once issued |
| DI-6 | Fiscal document numbering is gapless |
| DI-7 | Master data is soft-deleted; transactional data is never deleted |
| DI-8 | Every automatic GL posting names its source document |

---

## 8. Interfaces

| # | Interface | Status |
|---|---|---|
| IF-1 | REST/RPC API, versioned and documented | Required |
| IF-2 | WebSocket channel for production and stock events | Required |
| IF-3 | Barcode/QR scanner input (keyboard-wedge and camera) | Required |
| IF-4 | Label and document printing | Required |
| IF-5 | Email (transactional and scheduled reports) | Required |
| IF-6 | E-invoicing adapter (jurisdiction plugin) | **[OPEN-05a]** |
| IF-7 | Payment gateway | **[OPEN-31]** |
| IF-8 | Payroll system (penalty deduction export) | **[OPEN-30]** |
| IF-9 | Embroidery machine file transfer | **[OPEN-09]** |

---

## 9. Compliance

**[OPEN-05a]** Egypt's ETA e-invoicing and KSA's ZATCA Phase 2 are live government integrations that constrain the invoice data model itself, not merely its print format.

D-03 forbids hardcoding them. The architectural answer is FR-TAX-011 (extensible document attributes) plus FR-TAX-012 (adapter interface): the *capability to be extended* is built into the core now; the specific jurisdiction integration is a plugin built when the jurisdiction is confirmed.

**This remains the highest-risk item in the project.** Deferring it is now safe; deferring it *without* FR-TAX-011 and FR-TAX-012 would not be.

**[LEGAL-01]** — Employee penalties (§5.12). Automatic wage deduction is regulated by labour law in Egypt and across MENA, typically constraining maximum deduction per offence and per month, and requiring documented process and employee notification. **I am not qualified to state the current statutory limits, and have not assumed any.** The system therefore implements *configurable* ceilings, mandatory approval, and mandatory notification (FR-DMG-009/010/011) so it can be made compliant once counsel confirms the applicable rules. **The client must obtain legal confirmation before this module goes live.**

---

## 10. Product Archetype Matrix

| | Printing | Embroidery | Uniform | Safety | Custom | Hybrid |
|---|---|---|---|---|---|---|
| Cost strategy | Setup + area | Stitch count | Size-dependent BOM | Landed cost | Formula-defined | Composed |
| Make / buy | Make | Make | Make | Buy | Either | Make |
| Variant matrix | No | No | **Yes** | Optional | Optional | **Yes** |
| Reusable design asset | Artwork | **Digitised file** | Pattern | — | Optional | Multiple |
| Lot tracking | Optional | No | Optional | **Yes** | Optional | Inherited |
| Expiry | No | No | No | **Yes** | Optional | Inherited |
| Serial | No | No | No | **Subset** | Optional | Inherited |
| Approval gate | **Artwork** | **Artwork** | Sample | None | Configurable | **All applicable** |
| Waste modelling | **Critical** | Low | Cutting waste | None | Configurable | Per stage |

---

## 11. Traceability

| Directive | Satisfied by |
|---|---|
| D-01, D-02 | FR-PLT-001…003, NFR-13, NFR-22 |
| D-03 | FR-TAX-001…012 |
| D-04 | FR-PLT-004, FR-FIN-013/014, FR-CST-019 |
| D-05 | FR-PLT-004…006, FR-INV-001 |
| D-06 | FR-MDM-001…003, §10 |
| D-07 | FR-MFG-001…003 |
| D-08 | FR-MFG-004, FR-MFG-005 |
| D-09 | FR-FRM-001…012 |
| D-10 | FR-CST-010…014 |
| D-11 | FR-FIN-001…022 |
| D-12 | FR-IAM-001…015, NFR-12…17 |
| D-13 | FR-AIL-001…005 |
| D-14 | This document; §14 |

**All 14 directives are traced to requirements.**

### 11.1 Constitution traceability

| Article | Satisfied by |
|---|---|
| 1 Clean Architecture | NFR-19; [03_Architecture](03_System_Architecture.md) §4 |
| 2 DDD — nine domains | §3.1 domain map; FR-STG, FR-NTF, FR-HRM |
| 3 Modular monolith | ADR-004, ADR-012 (pending T-1) |
| 4 Event-driven | FR-AIL-001, FR-NTF-001, FR-MFG-024 |
| 5 Cost engine | FR-CST-001…020 |
| 6 Formula engine | FR-FRM-001…018 |
| 7 Product model | FR-MDM-001…003; FR-MFG-008, 023 |
| 8 BOM | FR-MFG-001…009, 025…029 |
| 9 Valuation | FR-INV-012…012f |
| 10 Auto accounting | FR-FIN-004/005, FR-INV-013, FR-DMG-005, DI-8 |
| 11 Security | FR-IAM-001…015; NFR-12…17a |
| 12 Multi-tenancy | FR-PLT-001…003; NFR-13, NFR-22 |
| 13 Reporting | FR-RPT-001…012 |
| 14 AI boundary | FR-AIL-000, 00a, 00b |
| 15 Doc currency | §15 (pending T-2) |
| 16 Debt stop rule | [00_Constitution](00_Constitution.md) §5 |

**All 16 articles traced.**

---

## 12. Build Order and Rationale

| Phase | Modules | Exit gate |
|---|---|---|
| 1 | PLT, IAM, STG | Tenant isolation proven by automated penetration test |
| 2 | FIN, TAX, INV | Trial balance balances; inventory sub-ledger reconciles to GL under **all four valuation methods** |
| 3 | MDM | Hybrid item (SC-1) expressible end to end |
| 4 | FRM, PUR, CRM, NTF | Quote → order → invoice → GL round trip; formula approval workflow operating |
| 5 | MFG, CST | Computed job cost within 5% of actual |
| 6 | HRM, DMG, RPT | CEO dashboard drills to source; penalty ceilings enforced |
| 7 | ECM | Portal shares one catalogue with ERP |
| 8 | AIL | ERP fully functional with AI disabled; AI layer holds no write port |

Finance and Inventory precede everything visible. Retrofitting a ledger beneath a live system is a rewrite, not a refactor.

---

## 13. Adopted Assumptions

Proceeding per client instruction. Each is **documented, not silent**, and reversible at the stated cost.

| ID | Assumption | Basis | Reversal cost if wrong |
|---|---|---|---|
| ASSUMED-01 | PPE expiry tracking is required | §2.4 analysis unchallenged; PPE has shelf life | Low — feature toggles off |
| ~~ASSUMED-02~~ | ~~Weighted Average default~~ | **RESOLVED by Constitution Art. 9** — all four methods now required. See FR-INV-012…012f. | — |
| ASSUMED-03 | PPE serial tracking and periodic inspection are in scope | Follows from certification requirements | Medium — module descopes cleanly |
| ASSUMED-04 | Staged/partial delivery is required | Standard in corporate uniform contracts | Low |
| ASSUMED-05 | Per-employee size rosters are required | Standard in corporate uniform contracts | Low |
| ASSUMED-06 | CoA ships as a configurable template, not a fixed structure | D-03 principle applied to accounting | Low |
| ASSUMED-07 | HRM holds employee records and discipline but **does not compute payroll** | Constitution Art. 2 names HR a domain; Art. 10 names penalties, not wages | Medium — payroll is a substantial module if added |

**5 assumptions remain open.** ASSUMED-07 is the one to confirm: it is the difference between an HR module and a payroll system.

---

## 14. Open Questions — Remaining

**Blocking (4)** — needed before the module named:

| ID | Blocks | Question |
|---|---|---|
| OPEN-05a | Phase 2 (TAX) | Which jurisdiction is the first e-invoicing target, and by when? Core is designed to absorb it; the plugin needs a target. |
| OPEN-25 | Phase 2 (FIN) | Existing chart of accounts to adopt, or design from template? |
| OPEN-23 | Phase 2 | Greenfield, or migrating a live system? If migrating — which system, and how much history? |

**Closed since v1.0:** OPEN-26 (valuation — Constitution Art. 9 mandates all four methods) · OPEN-30 partially (HR is now a domain; payroll boundary tracked as ASSUMED-07).

**Raised in v1.1, awaiting resolution:**

| ID | Pri | Question |
|---|---|---|
| T-1 | **B** | Approve ADR-012 module tiering? Constitution Art. 3 (all modules extractable) conflicts with Art. 10 (automatic, reliable bookkeeping). See [00_Constitution](00_Constitution.md) §5. |
| T-2 | H | Extend the governed document set to ten, adding `09_Workflows` and `10_Testing_Strategy` per Art. 15? |
| LIFO-1 | H | Is LIFO genuinely wanted? It is prohibited under IFRS/EAS. See [00_Constitution](00_Constitution.md) §3. |
| OPEN-33 | N | Is there an existing attendance/time system to ingest from (FR-HRM-010)? |

**High (11)** — needed before Phase 4–5:

| ID | Question |
|---|---|
| OPEN-06 | **How is print pricing computed today? If an estimator's spreadsheet exists, it is the single most valuable requirements artefact available. Please send it.** |
| OPEN-10 | Which printing processes — offset, digital, screen, DTF, sublimation, large-format? Each has a distinct cost model. |
| OPEN-09 | Embroidery fleet: how many machines, how many heads each? |
| OPEN-08 | Digitising cost: billed to customer, absorbed, or amortised over N orders? |
| OPEN-11 | Substrate purchased by sheet, roll, or weight? |
| OPEN-07 | Are gang runs used? How is cost split today? |
| OPEN-28 | Is subcontracting used? |
| OPEN-30 | Are Payroll, HR, and Fixed Assets in scope? FR-FIN-011 and FR-DMG-012 depend on the answer. |
| OPEN-31 | E-commerce: B2B portal, public B2C storefront, or both? |
| OPEN-32 | What should the AI layer actually *do*? |
| OPEN-03 | Peak concurrent users (NFR-11 currently assumes 500/tenant) |

**Normal (6):** OPEN-04 (RPO/RTO), OPEN-12 (thread colour system), OPEN-19 (profit centres per line — provisionally yes, FR-FIN-012), OPEN-20 (headcount), OPEN-27 (credit control — provisionally yes, FR-CRM-015), OPEN-29 (machine maintenance scheduling).

---

## 15. Governance

Per D-14: **no module is implemented before its documentation is updated.**

| Doc | Status |
|---|---|
| [00_Constitution](00_Constitution.md) | v1.0 ratified — binding |
| [01_Project_Vision](01_Project_Vision.md) | v1.0 complete |
| 02_SRS (this) | v1.1 complete |
| [03_System_Architecture](03_System_Architecture.md) | v1.1 complete |
| [04_Database_Design](04_Database_Design.md) | **v1.0 complete** — 130 tables; 7 decisions (D1–D7) await approval |
| [05_User_Roles](05_User_Roles.md) | Not started — required before Phase 1 |
| [06_API_Design](06_API_Design.md) | Not started — required before Phase 1 |
| [07_UI_UX](07_UI_UX.md) | **v1.0 complete** — includes the public marketing website (new deliverable, not one of the 18 ERP modules). ADR-015 and OPEN-34…39 raised there. |
| [08_Development_Roadmap](08_Development_Roadmap.md) | Not started — required before Phase 1 |
| 09_Workflows | Proposed under T-2 — required by Art. 15 |
| 10_Testing_Strategy | Proposed under T-2 — required by Art. 15 |

**Five documents remain before any code is written — seven if T-2 is approved.**

---

## 16. Change Log

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-08-05 | Intake edition — 30 open questions, 0 functional requirements |
| 1.0 | 2026-08-05 | Baseline. 14 directives ratified; 168 FRs and 22 NFRs drafted; 9 questions closed; 6 assumptions documented; 21 questions remain (4 blocking) |
| 1.1 | 2026-08-05 | Constitution v1.0 applied. 3 modules added (STG, NTF, HRM); 219 FRs; valuation expanded to 4 methods with cost layers; formula engine +6; BOM +5; AI made structurally read-only; 4 security NFRs made explicit; OPEN-26 closed; ASSUMED-02 resolved, ASSUMED-07 added; T-1, T-2, LIFO-1, OPEN-33 raised |
