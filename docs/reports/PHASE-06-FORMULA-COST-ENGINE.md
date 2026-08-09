# Phase 6 — Formula Engine + Cost Engine

**Status:** delivered · **Date:** 2026-08-09 · **Tag:** `phase-06-formula-cost-engine`

Phases 2 → 5.5 were not touched. No dashboard or theme change, no rebuild of
Sales / Inventory / Authentication, no PostgreSQL migration.

---

## The one architectural decision that shaped everything

Constitution **Article 5** forbids executing user formulas via `eval()` or
`new Function()`. That ruled out the obvious design — a text box where the
manager types `qty * 1.5 * price` — because a manager-supplied expression
running on the server with database access is arbitrary code execution, and
no amount of sanitising makes it safe.

So a formula here is **structured data, not text**. Each component declares:

- what it is (one of eight cost categories),
- how it is consumed (one of six calculation bases),
- how much, per what, and at what unit cost.

The engine is a fixed set of arithmetic rules over those declarations.

**What this costs, stated plainly:** a manager cannot invent a brand-new kind
of arithmetic. They *can* change every rate, quantity, yield, percentage and
parameter, add or remove components freely, and version the result. That
covers printing and embroidery costing as KAYAN actually does it. If a future
requirement genuinely needs arithmetic outside the six bases, the fix is a
seventh basis in `packages/domain/src/formula.ts` — a code change with a
review, not an interpreter.

---

## 1. Formula Engine — Completed

### Six calculation bases

| Basis | Meaning | Serves |
|---|---|---|
| `PER_PIECE` | qty per finished piece | fabric per shirt |
| `PER_ORDER` | qty once per production order | screen setup |
| `PER_YIELD` | qty per *N* pieces produced | **roll length / output capacity** |
| `PER_1000_STITCHES` | qty per thousand stitches | **embroidery thread** |
| `PER_MINUTE` | qty × computed run time | labour, machine time |
| `PERCENT_OF_DIRECT` | % of the direct subtotal | waste, indirect expenses |

`PER_YIELD` is what the brief called *roll length / consumption* and *output
capacity per product type*: a 50 m roll that yields 400 shirts is
`quantity = 50, yieldQty = 400`. Charged proportionally, not rounded up to
whole rolls — this is an estimate of cost, and a part-used roll is not
scrapped.

### Eight cost categories

`MATERIAL · INK · THREAD · LABOR · PACKAGING · MACHINE · OVERHEAD · WASTE` —
mapping one-to-one onto the reporting chain the brief specified, so no line
can land somewhere unreportable.

### Time estimation

```
minutesPerPiece = stitchCount ÷ stitchesPerMinute   (embroidery)
                | minutesPerPiece                    (everything else)
totalMinutes    = minutesPerPiece × quantity + setupMinutes
```

Setup is charged **once per order, not per piece** — which is precisely why a
long run is cheaper per piece than a short one.

### Parameters

Four keys the engine reads: `stitchCount`, `stitchesPerMinute`,
`minutesPerPiece`, `setupMinutes`. All editable, all empty by default. **A
missing parameter costs zero rather than substituting a guess** — an invented
default would produce a plausible cost nobody chose. This is asserted in the
test suite.

### Versioning

- A formula owns many `FormulaVersion` rows; exactly one is `PUBLISHED` and
  becomes `currentVersion`.
- **A published version is immutable.** "Editing" a published formula clones
  it into the next `DRAFT`; the published one is never written to again.
- Only one open draft at a time — two drafts and nobody can say which is
  "next".
- Publishing an **empty** version is refused: it would silently make every
  costed product free.
- A formula with **no** published version deliberately costs nothing, and the
  UI says so rather than showing a confident zero.

### Auditability

`formula.create`, `formula.update`, `formula.publish`, `formula.newVersion`,
`formula.assign`, `formula.softDelete`, `cost.calculate` all write AuditLog
rows.

---

## 2. Cost Engine — Completed

Chain implemented exactly as specified: Production Order → Product + Variant →
Formula (version used) → Materials → Printing → Embroidery → Labor →
Packaging → Machine → Secondary Expenses → Waste → **Total → Cost Per Piece →
Suggested Price → Gross Profit / Margin**.

**Margin, not markup.** A 25 % margin means cost is 75 % of price
(`price = cost ÷ (1 − margin/100)`). Confusing the two is the single most
common way a quoted price quietly loses money. A margin ≥ 100 % is
unreachable and returns null rather than dividing by zero.

**Percentage lines charge on the direct subtotal only, never on each other.**
Two 10 % lines charge 10 + 10, not 10 then 11. Verified: reordering the rows
cannot change the total.

All arithmetic is `Decimal` (Phase 4.5). Verified exact: `3 × 1.1 = 3.3`, not
`3.3000000000000003`.

### The snapshot

Every calculation writes a **new** `CostCalculation` with its own copied
lines. Nothing is ever recomputed in place. Every input — quantity, yield,
unit cost, basis — is copied, not referenced, so the row still explains
itself after the formula moves on.

---

## 3. Verification — 46/46, and the key claim was attacked, not asserted

`node --experimental-strip-types scripts/verify-phase6.mjs`

The claim that matters is *"changing a formula later does not affect old
calculations"*. The suite does not assert it — it attacks it:

1. Cost 100 pieces against the published formula → **7,972.25** stored.
2. Clone the version with **every unit cost doubled** and publish it.
3. Re-read the old calculation.

| Check | Result |
|---|---|
| Old total after republishing at double rates | **7,972.25 → 7,972.25** (unmoved) |
| Old snapshot line | unmoved |
| Old snapshot still points at the version it used | yes |
| A *new* calculation picks the new version up | 7,972.25 → **15,944.50** |
| …which is exactly double | yes |

Full regression run — **131 assertions, all passing**:

| Suite | Result |
|---|---|
| `verify-phase3` (core data) | 16/16 |
| `verify-decimal` (money) | 16/16 |
| `verify-phase4` (sales) | 18/18 |
| `verify-phase5` (manufacturing) | 35/35 |
| `verify-phase6` (formula + cost) | 46/46 |

`npm run lint` · `npm run typecheck` · `npm run build` — all clean. Seven
new/changed routes build.

### End-to-end validation, done through the real UI

A production order for 250 aprons (`MO-2026-0002`) was created through the
browser and costed through the browser. Every figure was then checked by hand:

| Line | Calculation | Result |
|---|---|---|
| Fabric | 1.5 m × 250 = 375 m × 45.00 | 16,875.00 |
| White ink | 1000 g × (250/400) = 625 g × 0.35 | 218.75 |
| Colour ink | 600 g × (250/400) = 375 g × 0.40 | 150.00 |
| Screen setup | once per order | 120.00 |
| Print labour | (0.4 × 250 + 30 setup) = 130 min × 1.50 | 195.00 |
| Packaging | 250 × 1.25 | 312.50 |
| **Direct** | | **17,871.25** |
| Waste 3 % | | 536.14 |
| Overhead 7 % | | 1,250.99 |
| **Total** | | **19,658.38** |
| **Per piece** | 19,658.375 ÷ 250 | **78.63** |
| Suggested @ 30 % margin | 78.6335 ÷ 0.7 | 112.33 |
| Profit per piece | | 33.70 |

Every one matches what the UI displayed.

---

## 4. Database — Completed

Eight new tables, purely additive. **No `ALTER` or `DROP` touched an existing
table**, and the money-snapshot diff confirmed **90 values compared, no data
loss**.

`Formula` · `FormulaVersion` · `FormulaLine` · `FormulaParam` ·
`ProductFormula` · `CostCalculation` · `CostCalculationFormula` ·
`CostCalculationLine`

Normalized, soft-delete on master data, `Decimal` for every money and
quantity field, PostgreSQL-portable (no SQLite-specific types).

---

## 5. Permissions — Completed

Added `formula.view`, `formula.write`, `cost.view`.

`cost.read` was **renamed** to `cost.view` to match the brief's naming and for
consistency with `manufacturing.view`. It was referenced only inside the RBAC
matrix — no UI depended on it — so the rename was safe. The seed prunes keys
the code no longer defines, so no orphan remains.

| Role | formula.view | formula.write | cost.view | cost.margin |
|---|---|---|---|---|
| ADMIN | ✓ | ✓ | ✓ | ✓ |
| MANAGER | ✓ | ✓ | ✓ | ✓ |
| SALES | — | — | ✓ | — |
| CUSTOMER | — | — | — | — |

SALES sees cost (they need it to quote) but **not** margin and **not**
formulas — the recipe is manufacturing know-how, not quoting data. Asserted
in the test suite.

---

## 6. UI — Completed

- `/formulas` — list, filter by kind, search, sort, paginate
- `/formulas/new` — create
- `/formulas/[id]` — lines, parameters, version history, product assignment,
  publish / start-new-version
- `/manufacturing/[id]` — cost calculation form + full breakdown
- `/products/[id]` — assigned formulas, read-only with published version
- Sidebar: **المعادلات والتكلفة**, permission-gated on `formula.view`

Existing light theme and dashboard untouched.

---

## Partial

**Sales document cost/profit fields** — as the brief scoped it ("prepare
fields… even if not fully shown yet"). The columns exist on `QuotationLine`
and `SalesOrderLine` (`costSnapshot`, `costSource`, `formulaVersion`,
`grossProfit`, `marginPercent`) from Phase 4.5, and `CostCalculation` now
carries a `salesOrderLineId` foreign key. **Nothing populates them yet** —
costing a sales line is not wired to a UI action. The plumbing is there; the
tap is not turned on.

**Actual vs. estimated cost** — both are computed identically today. Without
material-issue records there is nothing that would make an actual differ from
an estimate, and inventing a difference would be inventing a number. The
`kind` field distinguishes them and switches to `ACTUAL` once the order
completes, so the distinction is recorded even though the inputs are the same.

---

## Not built (deliberate)

- **Material issue from stock driven by formula consumption.** The engine now
  knows how many metres and grams an order consumes, but posting that as a
  real `StockMovement` needs formula lines linked to stock-tracked materials
  and a costing method (weighted average / FIFO). Half-wiring it would produce
  stock movements with no valuation behind them.
- **Machine cost as a distinct rate table** and **secondary expenses as an
  allocation model.** Both are representable today as `PER_MINUTE` and
  `PERCENT_OF_DIRECT` lines. Dedicated tables would add structure without
  adding an answer.

---

## Issues and honest caveats

1. **The seeded numbers are placeholders, not measurements.** `FRM-0001` and
   `FRM-0002` are shaped correctly but nobody measured them. Both carry
   `⚠ الأرقام الحالية قيم مبدئية للتجربة فقط` in their notes, shown in the UI.
   **They must be replaced with KAYAN's real rates before any quote is issued.**

2. **The tenant-isolation risk from ADR-002 is unchanged and still open.**
   SQLite has no row-level security; isolation is repository-layer only. The
   eight new tables inherit this. Must be resolved before real customer data.

3. **`PER_YIELD` charges partial rolls proportionally.** If KAYAN's purchasing
   reality is that a part-used roll is scrapped, this under-states cost on
   short runs. Flagged rather than assumed — it is a one-line change in
   `consumption()` once the business confirms which is true.

4. **Parameter collisions across formulas resolve by formula code order.**
   If a printing formula and an embroidery formula both define `stitchCount`,
   the higher code wins. Deterministic, but not obviously *right* — worth a
   look if multi-formula products become common.

5. **Screenshots are lower-resolution than ideal.** The preview pane caps
   captures at 800 px wide; at the 1024 px+ needed for the desktop sidebar,
   Arabic detail text downscales. Layout and structure are clear; the exact
   figures are transcribed in the validation table above instead.

6. One pre-existing production order (`MO-2026-0001`, `IN_PROGRESS`) sits on
   `SO-2026-0001`. It caused a false failure in the Phase 5 suite, which was
   borrowing live rows for a fixture. **The test was wrong, not the code** —
   the sales order correctly refused to become READY while an unfinished
   production order remained. The suite now builds and destroys its own sales
   order.

---

## Files

**New:** `packages/domain/src/formula.ts` · `apps/web/src/lib/cost.ts` ·
`apps/web/src/app/formulas/**` (8 files) ·
`apps/web/src/app/manufacturing/cost-actions.ts` ·
`apps/web/src/app/manufacturing/CostBreakdown.tsx` ·
`prisma/seed-phase6.mjs` · `scripts/verify-phase6.mjs` ·
`prisma/migrations/20260809055531_phase6_formula_cost_engine/`

**Changed:** `prisma/schema.prisma` · `packages/domain/src/{index,rbac}.ts` ·
`apps/web/src/components/AppShell.tsx` ·
`apps/web/src/app/manufacturing/[id]/page.tsx` ·
`apps/web/src/app/products/[id]/page.tsx` · `prisma/seed.mjs` ·
`scripts/verify-phase5.mjs`
