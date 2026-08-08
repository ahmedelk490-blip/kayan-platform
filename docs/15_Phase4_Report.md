# 15 — Phase 4 Completion Report

**Date:** 2026-08-08 · **Tag:** `phase-04-sales-foundation`
**Gate:** lint ✓ · typecheck ✓ · build ✓ — clean, zero warnings
**Verification:** Phase 3 **16/16** · Phase 4 **18/18** — against the real database

---

## ✅ Completed

### Database — 29 → 33 tables

`Quotation`, `QuotationLine`, `SalesOrder`, `SalesOrderLine`, plus sales
linkage on `StockMovement` and `Attachment`. Migration applied with no data
loss (all 14 existing StockMovement columns verified copied before applying).

### Pricing snapshot

Every line stores `unitPrice`, `discountAmount`, `discountPercent`, `taxRate`,
`taxAmount` and `lineTotal` as written. Nothing is recomputed from the current
product price on read.

**Proven:** the verification suite quotes at 100, then changes the variant's
selling price to 999, then re-reads the line — it still says 100. Converting
to an order carries the quoted price across unchanged, so the order always
agrees with what the customer accepted.

Columns are already in place for the Cost Engine — `costSnapshot`,
`costSource`, `formulaVersion`, `grossProfit`, `marginPercent` — null until
Phase 6 fills them. Adding them now avoids altering a table that historical
documents will depend on.

### Reservation — idempotent, enforced by the database

`StockMovement` carries `salesOrderId` **and** `salesOrderLineId`, with
`@@unique([salesOrderLineId, type])`.

That constraint is the guarantee, not an application check that a concurrent
request could race past:

| Test | Result |
|---|---|
| Confirm creates reservations | 1 created |
| **Re-confirm creates NOTHING** | 0 created |
| Exactly one RESERVE movement | ✓ |
| Constraint rejects a duplicate RESERVE insert | ✓ |
| Cancel releases | 1 released |
| **Re-cancel creates NOTHING** | 0 released |
| Exactly one UNRESERVE movement | ✓ |
| Original RESERVE preserved after cancel | ✓ |

Reservation raises `reserved` and leaves `onHand` untouched — the goods are
still physically present. **Available = onHand − reserved**, verified in the
suite and visible in the UI (120 − 25 = 95).

### Status machines

Quotation: DRAFT → SENT → ACCEPTED → CONVERTED, plus REJECTED/EXPIRED.
**CONVERTED is terminal and reachable only from ACCEPTED**, which is what
stops one quotation producing two orders. The convert button only appears at
ACCEPTED — confirmed in the UI.

Order: DRAFT → CONFIRMED → IN_PRODUCTION → READY → DELIVERED → COMPLETED,
with CANCELLED reachable from any live state and terminal.

Transitions live in `@erp/domain` as pure data and are enforced server-side.

### Customer timeline

Entries written on quotation created, accepted/rejected, order created,
confirmed and cancelled. Visible on the customer detail page.

### UI — 6 new routes

`/sales/quotations`, `/new`, `/[id]` · `/sales/orders`, `/new`, `/[id]`

Shared `DocumentForm` for both document types (identical line structure, so
one component that cannot drift). Status badges, status filter chips, search,
sort and pagination. Live totals preview client-side; the server recalculates
and stores its own result, so a tampered client changes nothing recorded.

The line editor shows available-to-promise per variant and flags when the
requested quantity exceeds it.

### RBAC

Added `sales.documents`, `sales.write`, `sales.confirm`. **24 permissions, 57
grants.** MANAGER and SALES hold all three; CUSTOMER holds none — it cannot
see or create a sales document.

`sales.confirm` is deliberately separate from `sales.write`: confirming moves
stock, which is a different kind of authority from editing a draft.

---

## ⚠ Partial

| Item | State |
|---|---|
| **Attachments** | `quotationId` / `salesOrderId` columns and relations exist. No upload — no storage backend configured. |
| **Print / PDF** | Structure only, as directed. Read-only document rendering exists for converted quotations; no PDF engine. |
| **Profit on quotations** | Deliberately not shown. Cost data does not exist yet, so any margin figure would be invented. The columns are ready. |
| **Order line editing after creation** | Orders are created from the form or converted from a quotation. Editing lines on an existing order is not built. |
| **Warehouse selection for reservation** | Reserves from the first warehouse by code. Multi-warehouse allocation is a Phase 5 concern. |

---

## ❌ Missing / deliberately not built

- **Production orders** — explicitly out of scope
- **Manufacturing, Formula Engine, Cost Engine** — out of scope
- **Invoices and payments** — not in this phase
- **Partial delivery / fulfilment** — DELIVERED is a status, not a quantity ledger yet

---

## 🔴 Issues and risks

**1. SQLite still has no row-level security.** Unchanged from Phase 3 and
still the largest gap. Tenant isolation is repository-layer only. **Must be
resolved before real data.**

**2. Money is still `Float`.** Now materially more exposed than in Phase 3,
because Phase 4 actually *computes* with these values — line totals, tax,
document roll-ups. `calcLine`/`calcDocument` round to 2 decimals at each
documented step to keep totals stable, but this is a mitigation, not a fix.
DI-3 prohibits floats in financial paths. **These must become
`NUMERIC(19,4)` before invoicing.**

**3. Document numbering is not gapless.** `QUO-2026-0001` is derived from the
highest existing number. Fine for quotations and orders; invoices will need
the sequence-allocation approach in `04_Database_Design` §9.3, because a gap
in invoice numbering is a tax-authority problem.

**4. Reservation picks one warehouse.** Correct for a single-warehouse
operation, which is what exists. Multi-warehouse allocation will need a real
policy.

**5. Still no automated tests in CI.** Both suites pass by hand (34 assertions
total) but nothing runs them on commit.

---

## Verification evidence

```
PASS  PRICING SNAPSHOT holds after product price change — line=100, product now 999
PASS  order carries the quoted price
PASS  confirm creates reservations — created=1
PASS  onHand unchanged by reservation — onHand=100
PASS  available = onHand - reserved
PASS  re-confirm creates NOTHING — created=0
PASS  exactly one RESERVE movement — count=1
PASS  unique(salesOrderLineId,type) rejects a duplicate RESERVE
PASS  cancel releases the reservation — released=1
PASS  re-cancel creates NOTHING — released=0
PASS  exactly one UNRESERVE movement — count=1
PASS  every reservation movement references order AND line — 2 movements
PASS  original RESERVE preserved after cancel

18/18 passed
```

**Through the running UI:** QUO-2026-0001 created for مطاعم البركة at 25 × 180
+ 14% tax = **5130** (arithmetic correct); DRAFT → SENT → ACCEPTED with the
transition buttons updating correctly at each step; convert button appearing
only at ACCEPTED; SO-2026-0001 created carrying the quoted price; confirming
posted a **+25 حجز** movement; the stock page then showed **الرصيد 120 ·
محجوز 25 · المتاح 95**.

---

## Change Log

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-08-08 | Phase 4 complete. 33 tables, 25 routes, 18/18 verification, all gates clean. |
