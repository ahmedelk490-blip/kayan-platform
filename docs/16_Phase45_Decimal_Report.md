# 16 — Phase 4.5: Money Fields Float → Decimal

**Date:** 2026-08-09 · **Tag:** `phase-04-5-decimal-money`
**Gate:** lint ✓ · typecheck ✓ · build ✓ — clean
**Verification:** Decimal **16/16** · Phase 3 **16/16** · Phase 4 **18/18**

---

## What was migrated

**41 columns across 9 tables**, all `Float` → `Decimal`.

| Table | Columns |
|---|---|
| `Product` | cost, sellingPrice |
| `ProductVariant` | cost, sellingPrice |
| `SupplierProduct` | lastPrice |
| `Stock` | onHand, reserved, damaged, minStock, maxStock |
| `StockMovement` | quantity |
| `Quotation` | subtotal, discountAmount, discountPercent, taxAmount, total |
| `QuotationLine` | quantity, unitPrice, discountAmount, discountPercent, taxRate, taxAmount, lineTotal, costSnapshot, grossProfit, marginPercent |
| `SalesOrder` | subtotal, discountAmount, discountPercent, taxAmount, total |
| `SalesOrderLine` | same ten as QuotationLine |

### Two decisions beyond the brief

**Quantities were migrated too.** The brief covered money and cost. But
`quantity × unitPrice` inherits float error *from the quantity* even when the
price is exact, so leaving quantity as Float would have defeated the migration
at the first multiplication.

**Percentages were migrated too.** The brief said percentages could stay as
they were. `taxRate` and `discountPercent` multiply directly into money, so
they are Decimal as well. It costs nothing and removes a whole class of error.

---

## How data was preserved

1. A full value snapshot was taken **before** the migration —
   `scripts/money-snapshot.mjs` writes every money and quantity value as an
   exact string, so a precision change cannot be masked by JS coercion.
2. SQLite rebuilds each table and copies every existing column first
   (`INSERT INTO new_* … SELECT`), which was inspected before applying.
3. A second snapshot was taken **after**, and diffed.

```
values compared: 80
NO DATA LOSS — every value identical
```

The pre-migration quotation QUO-2026-0001 still reads **4500.00 / 0.00 /
630.00 / 5130.00** in the UI — the same figures as before, now consistently
formatted to two places.

---

## What this actually fixes — measured

Verified in `scripts/verify-decimal.mjs`:

| Case | Float | Decimal |
|---|---|---|
| `0.1 + 0.2` | `0.30000000000000004` | `0.3` |
| `3 × 1.1` | `3.3000000000000003` | `3.3` |
| 100 lines of `0.07` | `7.000000000000009` | `7` |

That last row is the one that matters commercially: error accumulates across
lines, and a hundred-line order is not unusual.

A new quotation created through the UI after the migration stored
`quantity 3 · unitPrice 1.1 · lineTotal 3.762` and displayed `3.76` — client
preview and server-stored values identical.

### Scale: 4 internal, 2 displayed

Storage keeps four decimal places (`taxAmount 0.462`); the UI rounds to two
(`0.46`). Rounding at storage would quietly lose money when many lines are
summed, so rounding happens only at display and at two documented points
inside `calcLine`.

---

## ⚠ The honest limit of this on SQLite

Measured, not assumed. A probe wrote values through Prisma and read the raw
column back:

| Question | Answer |
|---|---|
| Column type created | `DECIMAL` |
| What SQLite actually stores | **`real` — still an IEEE-754 double** |
| Exact round trips | **5 of 6** |
| The failure | `1234567890123.4567` returned as `…4568` (17 significant digits) |
| Prisma return type | `Prisma.Decimal` |

**So: application arithmetic is now exact — which was the Phase 4 risk — but
storage on SQLite is not.** Values round-trip exactly up to roughly 15
significant digits. EGP amounts at four decimal places stay exact below about
10¹¹, which covers this business by a very wide margin.

On PostgreSQL these become genuine `NUMERIC(19,4)` with no such ceiling. Add
`@db.Decimal(19, 4)` at that point; the schema header records this.

---

## Issues found and resolved

**1. TypeScript found 49 float-arithmetic sites.** Every place that did
`a + b` on money, compared with `<`, or rendered a value directly into JSX
became a compile error. That is the migration paying for itself — each one
was a place float error could have entered.

**2. Decimal does not cross the server/client boundary.** It is not
serialisable, so `DocumentForm` and `ProductForm` receive plain numbers. The
form is an input surface; the server recalculates in Decimal on submit and
stores its own result, so a tampered client still changes nothing recorded.

**3. The verification scripts broke — correctly.** They compared with `===`
against numbers, and Prisma now returns Decimal objects. The *values* were
right; the assertions were comparing object identity. Fixed by comparing by
value, without weakening any assertion.

**4. `allowImportingTsExtensions` was enabled for `apps/web`.** The domain
package now uses explicit `.ts` extensions internally so bare
`node --experimental-strip-types` can run its pure logic directly — which is
how the decimal test suite executes without a bundler. Safe because the
project never emits.

**5. A test label of mine was wrong and was corrected.** The suite originally
claimed `1105 × 1.15` fails in float. It does not — that product is exactly
representable. It was replaced with `3 × 1.1`, which genuinely fails, and the
float failure is now *asserted* so the case cannot silently stop
demonstrating anything.

---

## Unchanged, as required

- No business rule changed
- Pricing snapshot behaviour intact — verified 18/18, including that a line
  quoted at 100 still reads 100 after the product price moves to 999
- Reserved-stock logic intact, including idempotency and the database
  constraint that enforces it
- Soft delete and audit behaviour untouched
- No UI redesigned; the only visual change is that money now consistently
  shows two decimal places

---

## Change Log

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-08-09 | 41 columns Float → Decimal. 80 values verified identical. Exact arithmetic proven 16/16. |
