# 04 — Database Design

**Version:** 1.0
**Date:** 2026-08-05
**Status:** PROPOSED — §12 decisions require approval before migration authoring
**Governed by:** [00_Constitution](00_Constitution.md) v1.0
**Traces to:** [02_SRS](02_SRS.md) v1.1 · [03_System_Architecture](03_System_Architecture.md) v1.3

---

## 1. Scope

PostgreSQL 16 schema for all 18 modules. **130 tables** across 15 domains.

This document specifies **conventions, the seven structurally novel designs, and the integrity mechanisms**. Routine tables are given as inventories rather than full DDL — their columns follow directly from the conventions in §3 and the requirements they trace to. Full DDL is authored as Prisma schema + SQL migrations after §12 is approved.

| Domain | Tables |
|---|---:|
| Platform & tenancy | 8 |
| Identity & access | 10 |
| Settings | 7 |
| Master data | 22 |
| Inventory | 11 |
| BOM & routing | 7 |
| Formula engine | 5 |
| Cost engine | 3 |
| Manufacturing | 7 |
| Purchasing | 8 |
| Sales & CRM | 14 |
| Finance | 11 |
| Tax | 6 |
| Damage & HR | 8 |
| Notifications & events | 3 |
| **Total** | **130** |

---

## 2. Design Principles

Every principle traces to a Constitution article or a data-integrity rule.

| # | Principle | Source |
|---|---|---|
| P-1 | Financial postings are append-only. No UPDATE, no DELETE — enforced by role grant, not convention. | DI-1, Art. 10 |
| P-2 | Stock is derived from movements. Balances are projections, rebuildable. | DI-2 |
| P-3 | Cost layers are the storage of record for valuation. | Art. 9, ADR-013 |
| P-4 | Exact decimal everywhere in financial paths. Floating point is prohibited. | DI-3, Art. 5 |
| P-5 | `tenant_id` on every scoped table, enforced by RLS. | Art. 12, ADR-002 |
| P-6 | Temporal correctness — rates, prices, formulas and BOMs carry validity ranges. | DI-5, Art. 8 |
| P-7 | Master data soft-deletes; transactional data never deletes. | DI-6 |
| P-8 | Audit written by trigger, so no application path can bypass it. | DI-7, Art. 11 |
| P-9 | Calculated documents store resolved values plus version ids — never live references. | Art. 5, FR-CST-014 |
| P-10 | Domain events are written in the same transaction as the state change. | Art. 4, Art. 10 |

---

## 3. Conventions

### 3.1 Naming

`snake_case` throughout. Tables plural (`sales_orders`), columns singular. Foreign keys `<entity>_id`. Booleans `is_`/`has_`. Timestamps `_at`. Enums as PostgreSQL native types, named `<domain>_<concept>`.

### 3.2 Primary keys — UUID v7

```sql
id  UUID PRIMARY KEY DEFAULT uuid_generate_v7()
```

**Why v7 over v4:** v7 is time-ordered, so inserts land at the index tail instead of scattering across it — v4 fragments B-trees badly at ERP write volumes.
**Why UUID over `bigserial`:** sequential integers leak business volume through URLs (a competitor reading `/invoices/1042` learns your invoice count), and identifiers must be generatable offline for on-premise instances that later sync.

**Exception:** fiscal document *numbers* (invoice number, journal entry number) are separate, human-facing, gapless, and sequence-allocated (§9.3). The UUID is the key; the number is the identity.

### 3.3 Numeric types — precision is a correctness decision

| Purpose | Type | Rationale |
|---|---|---|
| Money | `NUMERIC(19,4)` | EGP to 4dp; 15 integer digits |
| Quantity | `NUMERIC(19,6)` | Fabric in m², thread in metres |
| Unit cost | `NUMERIC(19,8)` | **Thread cost per stitch is genuinely sub-milli-piastre.** 4dp silently rounds embroidery costing to zero. |
| Percentage | `NUMERIC(9,6)` | Waste, margin, tax rates stored as `0.085000` = 8.5% |
| FX rate | `NUMERIC(19,10)` | — |

`DOUBLE PRECISION` and `REAL` are **prohibited** in every financial and quantity path, blocked by a CI schema check.

### 3.4 Standard columns

```sql
tenant_id    UUID NOT NULL              -- every scoped table
company_id   UUID                        -- where company-scoped
created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
created_by   UUID
updated_at   TIMESTAMPTZ
updated_by   UUID
deleted_at   TIMESTAMPTZ                 -- master data only (P-7)
row_version  INTEGER NOT NULL DEFAULT 1  -- optimistic concurrency
```

All timestamps `TIMESTAMPTZ`, stored UTC. Business dates that must not shift by timezone (invoice date, posting date) are `DATE`.

### 3.5 Translations

User-facing master data names are translatable (FR-PLT-013) via a `JSONB` column, not duplicated rows:

```sql
name JSONB NOT NULL   -- {"en": "Hi-Vis Vest", "ar": "سترة عالية الوضوح"}
```

Indexed with expression indexes per active locale. Rejected alternative: a `translations` side table — it forces a join on every list query, and list performance is NFR-07.

---

## 4. Multi-Tenancy & Row-Level Security

Implements ADR-002 and Constitution Article 12.

```sql
ALTER TABLE sales_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_orders FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON sales_orders
  USING      (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
```

Every request opens a transaction and sets the variable before any query:

```sql
SET LOCAL app.tenant_id = '<uuid>';
```

**`FORCE ROW LEVEL SECURITY` matters more than it looks.** Without it, the table owner bypasses the policy — and the migration role is usually the owner. Forcing it means even that role obeys isolation.

**The application connects as a non-superuser role with no `BYPASSRLS`.** This is the property that makes isolation undefeatable by application bugs: a forgotten `WHERE tenant_id = ...` returns zero rows rather than another tenant's data.

**Verification (NFR-13):** an automated suite calls every repository method under tenant A's context against tenant B's data and asserts zero rows. It runs on every build. A new repository method without a corresponding isolation test fails CI.

**On-premise:** identical schema, identical policies, exactly one `tenants` row.

---

## 5. Design 1 — The Six-Archetype Product Model

Implements FR-MDM-001…003 and Constitution Article 7. This is the design the whole catalogue rests on.

### 5.1 Core + extensions

```sql
CREATE TYPE item_archetype AS ENUM
  ('PRINTING','EMBROIDERY','UNIFORM','SAFETY','CUSTOM','HYBRID');

CREATE TABLE items (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id          UUID NOT NULL,
  company_id         UUID NOT NULL,
  code               TEXT NOT NULL,
  name               JSONB NOT NULL,
  archetype          item_archetype NOT NULL,
  item_group_id      UUID,
  base_uom_id        UUID NOT NULL,
  tracking_mode      item_tracking NOT NULL DEFAULT 'NONE',  -- NONE|LOT|SERIAL
  has_variants       BOOLEAN NOT NULL DEFAULT false,
  is_stockable       BOOLEAN NOT NULL DEFAULT true,
  is_purchasable     BOOLEAN NOT NULL DEFAULT false,
  is_sellable        BOOLEAN NOT NULL DEFAULT true,
  is_manufactured    BOOLEAN NOT NULL DEFAULT false,
  lifecycle_state    item_lifecycle NOT NULL DEFAULT 'DRAFT',
  ...
  UNIQUE (tenant_id, company_id, code)
);
```

Archetype-specific data lives in extension tables keyed 1:1 on `items.id`:

| Extension | Holds |
|---|---|
| `item_printing` | Process (offset/digital/screen/DTF/sublimation/large-format), substrate item, colours front/back, setup requirement, default spoilage % |
| `item_embroidery` | Default design, stitch count, thread system, backing type |
| `item_apparel` | Style, fit, pattern, size-chart id |
| `item_safety` | Standard references (EN/ANSI/ISO), notified body, certificate document, validity dates, shelf-life days, inspection interval |
| `item_custom` | Cost formula id, declared attribute schema |

### 5.2 How HYBRID works

**A Hybrid item is one row in `items` with `archetype = 'HYBRID'` and two or more extension rows.**

The hi-vis vest from SC-1 — printed, embroidered, EN ISO 20471 certified, size matrix — is:

```
items                  archetype = HYBRID
  ├─ item_printing     screen, 2 colours back
  ├─ item_embroidery   design DSN-0042, 8,400 stitches
  ├─ item_apparel      size matrix, pattern PTN-11
  └─ item_safety       EN ISO 20471, cert valid to 2028-04
```

A consistency trigger enforces the rule: **non-HYBRID archetypes permit exactly one matching extension; HYBRID requires at least two.**

**Rejected alternative — one wide `products` table with nullable columns per archetype.** Roughly 60% of columns would be NULL on any row, `NOT NULL` constraints become unenforceable so the database stops protecting the data, and a seventh archetype means altering a table every module reads. The extension model adds a table instead.

### 5.3 Variants

```sql
CREATE TABLE item_variants (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id     UUID NOT NULL,
  item_id       UUID NOT NULL REFERENCES items(id),
  sku           TEXT NOT NULL,
  size_id       UUID REFERENCES sizes(id),
  color_id      UUID REFERENCES colors(id),
  barcode       TEXT,
  qr_payload    TEXT,
  UNIQUE (tenant_id, sku),
  UNIQUE (tenant_id, item_id, size_id, color_id)
);
```

**Stock, cost layers, and movements reference `item_variant_id`, never `item_id`.** An item without variants gets exactly one default variant, so there is a single code path for stock everywhere — no branching between "simple" and "variant" items.

---

## 6. Design 2 — Size- and Colour-Dependent BOM

Implements FR-MFG-004/005 and Constitution Article 8. **This is the design that prevents the silent margin erosion described in [01_Project_Vision](01_Project_Vision.md) §2** — a 3XL consuming more fabric than an S.

```sql
CREATE TYPE consumption_mode AS ENUM ('SCALAR','MATRIX','FORMULA');

CREATE TABLE bom_lines (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id         UUID NOT NULL,
  bom_id            UUID NOT NULL REFERENCES boms(id),
  line_no           INTEGER NOT NULL,
  component_item_id UUID NOT NULL REFERENCES items(id),
  line_type         bom_line_type NOT NULL,   -- FABRIC|PRINT_MATERIAL|
                                              -- EMB_MATERIAL|TRIM|
                                              -- PACKAGING|CONSUMABLE
  consumption_mode  consumption_mode NOT NULL,
  qty_scalar        NUMERIC(19,6),            -- when SCALAR
  formula_id        UUID REFERENCES formulas(id),  -- when FORMULA
  uom_id            UUID NOT NULL,
  waste_pct         NUMERIC(9,6) NOT NULL DEFAULT 0,
  machine_time_min  NUMERIC(19,6),
  labor_time_min    NUMERIC(19,6),
  requires_qc       BOOLEAN NOT NULL DEFAULT false,
  CHECK (
    (consumption_mode = 'SCALAR'  AND qty_scalar IS NOT NULL) OR
    (consumption_mode = 'FORMULA' AND formula_id IS NOT NULL) OR
    (consumption_mode = 'MATRIX')
  )
);
```

The matrix — one row per size/colour combination that differs:

```sql
CREATE TABLE bom_line_consumption (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id    UUID NOT NULL,
  bom_line_id  UUID NOT NULL REFERENCES bom_lines(id) ON DELETE CASCADE,
  size_id      UUID REFERENCES sizes(id),    -- NULL = any size
  color_id     UUID REFERENCES colors(id),   -- NULL = any colour
  qty          NUMERIC(19,6) NOT NULL,
  UNIQUE (bom_line_id, size_id, color_id)
);
```

**Resolution order — most specific wins:**

```
(size, colour) exact  →  (size, NULL)  →  (NULL, colour)  →  (NULL, NULL)  →  qty_scalar
```

A NULL acts as a wildcard, so a fabric that varies by size but not colour needs one row per size, not one per size × colour. Colour-dependent *material selection* (a different thread item per garment colour) is expressed by `component_item_id` differing across `bom_line_alternatives`.

### 6.1 Alternative materials

```sql
CREATE TABLE bom_line_alternatives (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  bom_line_id    UUID NOT NULL REFERENCES bom_lines(id) ON DELETE CASCADE,
  alt_item_id    UUID NOT NULL REFERENCES items(id),
  priority       INTEGER NOT NULL,
  selection_rule alt_rule NOT NULL,   -- AVAILABILITY|COST|MANUAL
  qty_factor     NUMERIC(19,6) NOT NULL DEFAULT 1,
  UNIQUE (bom_line_id, priority)
);
```

`qty_factor` matters: a substitute fabric at different width consumes a different quantity. The cost sheet records **which alternative was actually consumed** (FR-MFG-026), so margin analysis reflects reality rather than the plan.

### 6.2 Versioning and effective dating

`boms` carries `version`, `status` (DRAFT/ACTIVE/SUPERSEDED), `effective_from`, `effective_to`, and approval columns. A work order **pins `bom_id`** at release (FR-MFG-002), so later revisions never alter an in-flight order.

`EXCLUDE USING gist` prevents overlapping active date ranges for the same item — a constraint that removes an entire class of "which BOM was active?" ambiguity.

---

## 7. Design 3 — Cost Layers

Implements FR-INV-012…012f, Constitution Article 9, ADR-013.

```sql
CREATE TABLE cost_layers (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id         UUID NOT NULL,
  company_id        UUID NOT NULL,
  warehouse_id      UUID NOT NULL,
  item_variant_id   UUID NOT NULL,
  lot_id            UUID,
  serial_id         UUID,
  received_at       TIMESTAMPTZ NOT NULL,
  qty_received      NUMERIC(19,6) NOT NULL CHECK (qty_received > 0),
  qty_remaining     NUMERIC(19,6) NOT NULL CHECK (qty_remaining >= 0),
  unit_cost         NUMERIC(19,8) NOT NULL,
  source_movement_id UUID NOT NULL,
  CHECK (qty_remaining <= qty_received)
);

CREATE INDEX ix_layers_open ON cost_layers
  (tenant_id, company_id, warehouse_id, item_variant_id, received_at)
  WHERE qty_remaining > 0;   -- partial index: consumption only reads open layers
```

Consumption is recorded, not just computed:

```sql
CREATE TABLE cost_layer_consumptions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id         UUID NOT NULL,
  issue_movement_id UUID NOT NULL REFERENCES stock_movements(id),
  cost_layer_id     UUID NOT NULL REFERENCES cost_layers(id),
  qty               NUMERIC(19,6) NOT NULL,
  unit_cost         NUMERIC(19,8) NOT NULL,
  amount            NUMERIC(19,4) NOT NULL
);
```

**This table is what makes FR-INV-012f true:** any issue can name the receipts its cost came from, and therefore the supplier, the purchase order, and the landed cost behind every figure. Article 5's *"every cost must explain where it came from"* gets a foundation underneath the cost engine, not merely inside it.

| Method | Consumption |
|---|---|
| Weighted Average | Computed across open layers at issue time; layers still consumed for traceability |
| FIFO | Oldest `received_at` first, splitting the final layer |
| LIFO | Newest first ⚠ IFRS-prohibited, disabled by default (FR-INV-012e) |
| Specific Cost | The layer matching the named `lot_id` / `serial_id` |

**Concurrency:** layer consumption takes `SELECT … FOR UPDATE` on candidate layers ordered deterministically. Without this, two concurrent issues can both read `qty_remaining` and over-consume. Ordering the lock acquisition prevents deadlock between them.

Storing layers even for Weighted Average is deliberate: WAC-only storage cannot be migrated to FIFO without reconstructing history, and P-2 makes that reconstruction possible but expensive.

---

## 8. Design 4 — The Cost Sheet Derivation Tree

Implements FR-CST-010…014 and Constitution Article 5. The most important table group in the schema.

```sql
CREATE TABLE cost_sheets (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id              UUID NOT NULL,
  company_id             UUID NOT NULL,
  sheet_no               TEXT NOT NULL,
  revision               INTEGER NOT NULL DEFAULT 1,
  subject_type           cost_subject NOT NULL,  -- QUOTATION|SALES_ORDER|
                                                 -- WORK_ORDER|ITEM_ESTIMATE
  subject_id             UUID,
  item_variant_id        UUID NOT NULL,
  quantity               NUMERIC(19,6) NOT NULL,
  strategy               TEXT NOT NULL,          -- which costing strategy ran
  currency_id            UUID NOT NULL,
  fx_rate                NUMERIC(19,10) NOT NULL,
  fx_date                DATE NOT NULL,
  total_production_cost  NUMERIC(19,4) NOT NULL,
  cost_per_unit          NUMERIC(19,8) NOT NULL,
  selling_price          NUMERIC(19,4),
  gross_profit           NUMERIC(19,4),
  net_profit             NUMERIC(19,4),
  margin_pct             NUMERIC(9,6),
  issued_at              TIMESTAMPTZ NOT NULL,
  issued_by              UUID NOT NULL,
  UNIQUE (tenant_id, sheet_no, revision)
);
```

The tree:

```sql
CREATE TABLE cost_sheet_nodes (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id          UUID NOT NULL,
  cost_sheet_id      UUID NOT NULL REFERENCES cost_sheets(id),
  parent_node_id     UUID REFERENCES cost_sheet_nodes(id),
  path               LTREE NOT NULL,        -- materialised path
  sort_order         INTEGER NOT NULL,
  node_type          cost_node_type NOT NULL,  -- GROUP|COMPUTED|INPUT
  label              JSONB NOT NULL,        -- {"en": …, "ar": …}
  formula_version_id UUID REFERENCES formula_versions(id),
  value              NUMERIC(19,8) NOT NULL,
  uom_id             UUID
);

CREATE TABLE cost_sheet_node_inputs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id       UUID NOT NULL,
  node_id         UUID NOT NULL REFERENCES cost_sheet_nodes(id),
  name            TEXT NOT NULL,            -- 'size_matrix[L]'
  value           NUMERIC(19,8) NOT NULL,   -- 1.42
  source_type     cost_input_source NOT NULL,  -- BOM_LINE|COST_LAYER|
                                               -- PRICE_LIST|FORMULA_CONST|
                                               -- WORK_CENTER|DESIGN|MANUAL
  source_ref_id   UUID,
  source_note     TEXT                      -- 'BOM v7 line 2'
);
```

**Why `LTREE` rather than recursive CTE traversal:** the UI expands arbitrary subtrees on demand (FR-CST-012), and a materialised path fetches a subtree with one indexed prefix match instead of a recursive walk per expansion. Sheets are written once and read many times, so paying at write is correct.

### 8.1 Immutability

`cost_sheets` and both child tables are **append-only** — the same role-grant mechanism as the ledger (§9.1). Recalculation writes `revision + 1`; the original is never touched.

The mechanism that makes this work is P-9: nodes store **resolved values and version ids**, not foreign keys to live prices or formulas. When a formula is edited or a price changes tomorrow, a sheet issued today still renders identically because every number it needs is inside it. This is what makes FR-CST-015 (estimated vs actual variance) meaningful — both sides are fixed points.

---

## 9. Design 5 — The Immutable Ledger

Implements FR-FIN-002/003 and Constitution Article 10.

```sql
CREATE TABLE journal_entries (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id           UUID NOT NULL,
  company_id          UUID NOT NULL,
  entry_no            TEXT NOT NULL,
  entry_date          DATE NOT NULL,
  fiscal_period_id    UUID NOT NULL REFERENCES fiscal_periods(id),
  status              je_status NOT NULL,   -- POSTED|REVERSED
  source_doc_type     TEXT NOT NULL,        -- P-1: every posting names its source
  source_doc_id       UUID NOT NULL,
  reversal_of_id      UUID REFERENCES journal_entries(id),
  posted_at           TIMESTAMPTZ NOT NULL,
  posted_by           UUID NOT NULL,
  UNIQUE (tenant_id, company_id, entry_no)
);

CREATE TABLE journal_lines (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id     UUID NOT NULL,
  entry_id      UUID NOT NULL REFERENCES journal_entries(id),
  line_no       INTEGER NOT NULL,
  account_id    UUID NOT NULL REFERENCES accounts(id),
  cost_center_id UUID,
  branch_id     UUID,
  debit         NUMERIC(19,4) NOT NULL DEFAULT 0,
  credit        NUMERIC(19,4) NOT NULL DEFAULT 0,
  currency_id   UUID NOT NULL,
  fx_rate       NUMERIC(19,10) NOT NULL,
  base_debit    NUMERIC(19,4) NOT NULL,
  base_credit   NUMERIC(19,4) NOT NULL,
  CHECK (debit >= 0 AND credit >= 0),
  CHECK (NOT (debit > 0 AND credit > 0))
);
```

### 9.1 Append-only enforcement

```sql
REVOKE UPDATE, DELETE ON journal_entries, journal_lines FROM app_role;
```

**The privilege is not granted, so no code path can revoke immutability** — not an ORM call, not a migration, not a mistake in a use case. A reversal is a new entry with `reversal_of_id` set. `status` is the sole exception, changed only by a `SECURITY DEFINER` function that writes the reversal and flips the flag atomically.

### 9.2 Balance enforcement

A `DEFERRABLE INITIALLY DEFERRED` constraint trigger checks, at commit, that every touched entry sums debits to credits in base currency. Deferred rather than immediate because lines are inserted one at a time; an immediate check would fail on the first line of every valid entry.

### 9.3 Gapless numbering

```sql
CREATE TABLE number_sequences (
  id           UUID PRIMARY KEY,
  tenant_id    UUID NOT NULL,
  company_id   UUID NOT NULL,
  doc_type     TEXT NOT NULL,
  fiscal_year  INTEGER,
  prefix       TEXT,
  next_value   BIGINT NOT NULL,
  UNIQUE (tenant_id, company_id, doc_type, fiscal_year)
);
```

Allocated by `SELECT … FOR UPDATE` **inside the posting transaction**. PostgreSQL sequences are explicitly *not* used: they are non-transactional and leave gaps on rollback, and a tax authority treats a gap in invoice numbering as evidence of a deleted invoice.

**Accepted cost:** this serialises number allocation per document type. It is the correct trade — gapless numbering is a legal requirement (DI-6), throughput is not.

---

## 10. Design 6 — Formula Versioning

Implements FR-FRM-004…006, 017, 018 and Constitution Article 6.

```sql
CREATE TABLE formula_versions (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id          UUID NOT NULL,
  formula_id         UUID NOT NULL REFERENCES formulas(id),
  version            INTEGER NOT NULL,
  expression_source  TEXT NOT NULL,      -- human-readable, for the editor
  ast                JSONB NOT NULL,     -- parsed + validated; what executes
  status             formula_status NOT NULL,  -- DRAFT|VALIDATED|APPROVED|
                                               -- ACTIVE|RETIRED
  change_comment     TEXT NOT NULL,      -- mandatory (FR-FRM-010)
  created_by         UUID NOT NULL,
  approved_by        UUID,
  approved_at        TIMESTAMPTZ,
  activated_at       TIMESTAMPTZ,
  UNIQUE (formula_id, version)
);
```

**The `ast` column is what executes, not `expression_source`.** The source string is parsed and validated once at save; evaluation walks the stored AST. No string reaches any execution primitive at calculation time — the sandbox guarantee of Article 6 is enforced at the storage boundary, not only in the evaluator.

`formula_versions` is append-only. Editing creates a new row; approval and activation set columns on that row via a controlled function. A partial unique index permits **at most one ACTIVE version per formula per scope**.

`formula_test_cases` holds saved inputs and expected outputs; a version cannot reach APPROVED while any test fails (FR-FRM-018).

---

## 11. Design 7 — Transactional Outbox

Implements Constitution Article 4 with Article 10's reliability guarantee.

```sql
CREATE TABLE domain_events (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id      UUID NOT NULL,
  occurred_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  aggregate_type TEXT NOT NULL,
  aggregate_id   UUID NOT NULL,
  event_type     TEXT NOT NULL,     -- OrderCreated, StockChanged, …
  payload        JSONB NOT NULL,
  schema_version INTEGER NOT NULL,
  published_at   TIMESTAMPTZ
);

CREATE INDEX ix_events_unpublished ON domain_events (occurred_at)
  WHERE published_at IS NULL;
```

**The event is inserted in the same transaction as the state change** (P-10). A relay process publishes unpublished rows to the queue and stamps `published_at`.

**Why not publish directly from the use case:** a direct publish can succeed while the transaction rolls back, emitting `InvoicePaid` for an invoice that does not exist. The outbox makes event emission exactly as atomic as the state change — which is what lets Reporting, Notifications, and AI (all Tier-2 extractable per ADR-012) trust the stream.

Append-only; retained per a configurable policy, archived rather than deleted.

---

## 12. Decisions Requiring Approval

| # | Decision | Recommendation | If rejected |
|---|---|---|---|
| **D1** | Primary key strategy | UUID v7 everywhere | `bigserial` is faster and smaller but leaks volume and breaks offline generation |
| **D2** | Translations as JSONB | JSONB on the row | A side table costs a join on every list query (NFR-07) |
| **D3** | `LTREE` for cost trees | Enable the `ltree` extension | Recursive CTE per expansion — slower reads, simpler ops |
| **D4** | Append-only by privilege revocation | Revoke UPDATE/DELETE from `app_role` | Trigger-based blocking is bypassable by a superuser migration |
| **D5** | Cost layers for all four methods | Always store layers | WAC-only is cheaper now and cannot be migrated later |
| **D6** | Gapless numbers serialise allocation | Accept the contention | Sequences are faster but leave gaps — legally unacceptable |
| **D7** | Partitioning | **Defer.** Add `stock_movements`, `journal_lines`, `domain_events` partitioning by fiscal period when volume justifies it. | Partitioning now optimises for load that does not exist yet |

**D7 deserves a note.** Partitioning these three tables later is straightforward *if* the partition key is present from day one. `fiscal_period_id` and `occurred_at` are therefore mandatory columns now, even though nothing partitions on them yet.

---

## 13. Indexing Strategy

| Pattern | Rule |
|---|---|
| Tenant scoping | Every multi-column index **leads with `tenant_id`** — RLS adds it to every predicate, so an index without it is unusable |
| Partial indexes | Open cost layers (`qty_remaining > 0`), unpublished events, active BOM versions, undeleted master data |
| Covering indexes | List views per NFR-07 include their display columns via `INCLUDE` |
| JSONB | Expression indexes on `name->>'en'` and `name->>'ar'`; GIN only where full-text search is required |
| Foreign keys | Every FK indexed — Postgres does not do this automatically, and unindexed FKs make deletes and joins quietly slow |
| Temporal | GiST exclusion constraints on validity ranges (BOMs, prices, tax rates) |

---

## 14. Open Questions

| ID | Pri | Question |
|---|---|---|
| OPEN-25 | **B** | Existing chart of accounts to adopt, or design from template? Blocks `accounts` seeding. |
| OPEN-23 | **B** | Greenfield or migration? If migrating, opening cost layers and balances need a defined import path — and historical layers may not be reconstructable, which affects FIFO from day one. |
| OPEN-40 | H | Data retention policy for `domain_events`, `audit_log`, and `activity_log`? Drives archival design. |
| OPEN-41 | H | Is a `SERIAL`-tracked item ever partially consumed? Affects whether serials carry quantity or are strictly unitary. |
| OPEN-06 | H | The estimator's pricing spreadsheet — still the calibration source for formula seeding. |

---

## 15. Change Log

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-08-05 | Initial database design. 130 tables across 15 domains; conventions fixed; 7 novel designs specified with DDL — archetype extensions, size/colour BOM matrix, cost layers, cost-sheet derivation tree, immutable ledger, formula versioning, transactional outbox. 7 decisions raised for approval; OPEN-40, OPEN-41 added. |
