# 17 — Phase 5: Manufacturing Foundation

**Date:** 2026-08-09 · **Tag:** `phase-05-manufacturing-foundation`
**Gate:** lint ✓ · typecheck ✓ · build ✓ — clean
**Verification:** Phase 5 **35/35** · Phase 4.5 **16/16** · Phase 4 **18/18** · Phase 3 **16/16** — 85 assertions

---

## One deliberate deviation from the brief

The brief said two things that cannot both be honoured:

> When Production Order moves to "In Progress": Create StockMovement of type
> "Production Issue" (or similar) …

> Do not invent material consumption yet (no Formula Engine).

Without a BOM there is no way to know *which* materials an order consumes or
*how much* of them. Any movement posted at `IN_PROGRESS` would be a number the
system made up, which is exactly what the second instruction forbids — and a
fabricated issue is worse than no issue, because it corrupts the append-only
ledger that DI-2 makes the record of truth.

**What was built instead:**

| Transition | Stock effect | Why |
|---|---|---|
| `→ IN_PROGRESS` | none | No material quantity is knowable yet |
| `→ COMPLETED` | `RECEIPT` of `+quantity` for the finished variant | The output *is* knowable: this order produced this many of this variant |

The receipt is real, positive, auditable, and idempotent. Material issue on
start arrives with the Formula Engine, when a BOM can answer *what* and *how
much*. The detail page states this to the operator in Arabic rather than
leaving a silent gap.

---

## Database

Three new tables — **36 total** (was 33).

### `ProductionOrder`

| Field | Notes |
|---|---|
| `number` | `MO-2026-0001`, unique per tenant |
| `salesOrderId`, `salesOrderLineId`, `customerId` | all nullable — an order can be for stock |
| `productId`, `variantId` | variant-level, per the approved rule |
| `quantity` | `Decimal` |
| `priority` | `LOW · NORMAL · HIGH · URGENT` |
| `status` | `DRAFT · CONFIRMED · IN_PROGRESS · QC · COMPLETED · CANCELLED` |
| `plannedStartDate`, `plannedEndDate`, `actualStartDate`, `actualEndDate` | |
| `estimatedCost`, `actualCost` | `Decimal?` — **deliberately empty**, see below |
| `confirmedAt`, `startedAt`, `completedAt`, `cancelledAt` | workflow stamps |
| `isDeleted`, `deletedAt` | soft delete |

### `ProductionOrderAssignee`

`(productionOrderId, userId)` composite key plus an optional `role`. The
relation is **prepared only** — there is no assignment UI, as specified.

### `WorkOrder`

`sequence` (unique per production order), `name`, `status`
(`PENDING · IN_PROGRESS · DONE · SKIPPED`), planned/actual dates, `notes`.
Deliberately thin: no materials, no cost, no routing.

### `StockMovement` — extended, not replaced

```prisma
productionOrderId String?
@@unique([productionOrderId, type])
```

Idempotency is enforced by **the database**, not by an application check —
same principle as the Phase 4 reservation constraint. The verification proves
this directly by attempting a second `RECEIPT` outside the application and
confirming the write is rejected.

**Migration:** `20260809013256_phase5_manufacturing` — 90 values compared
before and after, **no data loss**.

---

## Status machine

Pure data in `packages/domain/src/production.ts` (Article 1 — no Prisma, no
Next.js, unit-testable standing nothing up).

```
DRAFT ──────► CONFIRMED ──────► IN_PROGRESS ──────► QC ──────► COMPLETED
  │               │                   │              │
  └───────────────┴───────────────────┴──────────────┴──────► CANCELLED
                                      ▲              │
                                      └──────────────┘  (rework)
```

**`COMPLETED` is reachable only through `QC`.** A finished order that never
passed inspection is precisely what this workflow exists to prevent. Both
`COMPLETED` and `CANCELLED` are terminal.

---

## Sales ↔ Manufacturing coupling

Both directions, both visible:

- Sales order detail lists its production orders and offers
  **"+ أمر إنتاج من هذا الأمر"** (pre-selects the order on the create form).
- Production order detail links back to the sales order and the customer.
- Production `→ IN_PROGRESS` moves a `CONFIRMED` sales order to `IN_PRODUCTION`.
- Production `→ COMPLETED` moves the sales order to `READY` **only when every
  other production order on it is finished or cancelled** — a partially built
  order must not be announced as ready.
- Every status change appends to the customer timeline.

---

## RBAC

| Permission | ADMIN | MANAGER | SALES | CUSTOMER |
|---|---|---|---|---|
| `manufacturing.view` | ✓ | ✓ | — | — |
| `manufacturing.write` | ✓ | ✓ | — | — |
| `manufacturing.confirm` | ✓ | ✓ | — | — |

`manufacturing.read` was renamed to `.view` to match the specified naming. The
seed now **prunes permissions the code no longer defines**, so the old key was
removed from the database rather than left orphaned — 25 permissions, 59
grants (was 24 / 57).

---

## UI

| Route | Purpose |
|---|---|
| `/manufacturing` | List — search, status filter, sort, pagination, status + priority badges |
| `/manufacturing/new` | Create (accepts `?salesOrderId=` to pre-link) |
| `/manufacturing/[id]` | Detail — workflow buttons, work orders, dates, cost, assignees, stock movements |
| `/manufacturing/[id]/edit` | Edit — **drafts only** |

Sidebar section **التصنيع** is live and permission-filtered. The ERP visual
system (white, `#5C2535`, Kufi) is unchanged — nothing was redesigned.

Two UI rules worth recording:

- **Editing stops at `DRAFT`.** Once an order is confirmed it has left the
  office; changing its quantity or product would silently contradict what the
  floor is already making. The edit route redirects rather than showing a form
  whose submit would be rejected.
- **Priority sorts by weight, not alphabetically.** `priority` is a string
  column, so a database sort would order it HIGH, LOW, NORMAL, URGENT —
  meaningless. That one sort is done in memory.

---

## Verified end to end with real data

`MO-2026-0001` was created through the UI against the imported Drive catalogue
and the existing real sales order:

- 25 × المرايل (`APRONS-001-DEF`), priority عالية, linked to
  `SO-2026-0001 — مطاعم البركة`
- Work steps: قص القماش → طباعة الشعار → خياطة وتجميع → كي وتغليف
- Walked `DRAFT → CONFIRMED → IN_PROGRESS`; the sales order flipped itself to
  **قيد الإنتاج** and now lists the production order back.

No fabricated records were introduced.

---

## Completion table

| Item | Status |
|---|---|
| Production Orders (CRUD) | ✅ Complete |
| Sales Order → Production Order link, both directions | ✅ Complete |
| Production workflow statuses | ✅ Complete |
| Work Order structure | ✅ Complete |
| Permissions `.view` / `.write` / `.confirm` | ✅ Complete |
| Soft delete, audit, Decimal, Postgres-portable | ✅ Complete |
| List UI — search / filter / sort / pagination | ✅ Complete |
| Assigned Employees | ⚠️ Relation only, as specified — no UI |
| Estimated / Actual Cost | ⚠️ Fields only, as specified — empty, no Cost Engine |
| Material reservation on start | ⚠️ **Not built — see the deviation above** |
| Finished-goods receipt on completion | ✅ Complete (idempotent, DB-enforced) |
| Formula / Cost / Printing / Embroidery engines | ⛔ Out of scope, not built |

---

## Carried risks — unchanged from Phase 4, still open

1. **SQLite has no row-level security.** Tenant isolation is repository-layer
   only. ADR-002 called this insufficient for production. This must be
   resolved before real customer data goes in.
2. **Money is float-backed on SQLite.** Exact below ~15 significant digits;
   the `Decimal` columns become genuinely exact on PostgreSQL.
3. **Document numbering is not gapless.** `MO-` numbers are derived from the
   highest existing number. Acceptable for an internal work instruction;
   invoices will need real sequence allocation.
4. **No automated tests in CI.** The 85 assertions across four suites are run
   by hand.

## New, specific to this phase

5. **Screenshots were captured at a narrow viewport.** The preview pane would
   not hold a desktop viewport for capture; the layout was verified at desktop
   width through the accessibility tree instead. Desktop-width screenshots can
   be retaken on request.
