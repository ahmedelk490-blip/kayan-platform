# 14 — Phase 3 Completion Report

**Date:** 2026-08-08 · **Tag:** `phase-03-core-data-complete`
**Gate:** `npm run lint` ✓ · `npm run typecheck` ✓ · `npm run build` ✓ — all clean
**Verification:** `node scripts/verify-phase3.mjs` — **16/16 passed** against the real database

---

## ✅ Completed

### Database — 12 → 29 tables

| Area | Tables |
|---|---|
| Catalogue | `Category` (self-referencing for subcategories), `Product`, `ProductVariant`, `ProductImage` |
| Lookups | `Color`, `Size`, `Material`, `PrintingOption`, `EmbroideryOption` |
| Links | `ProductMaterial`, `ProductPrintingOption`, `ProductEmbroideryOption`, `SupplierProduct` |
| Inventory | `Warehouse`, `WarehouseLocation`, `Stock`, `StockMovement` |
| Partners | `Customer`, `CustomerActivity`, `Supplier`, `Attachment` |

Migration `20260808175055_phase3_core_data` applied with **zero data loss** — all
7 products, 5 categories and 39 images survived.

### Stock at variant level

`Stock` and `StockMovement` hang off `ProductVariant`, never `Product`. Each
variant carries its own SKU, barcode, cost, selling price, images and stock.
Unique on `(productId, colorId, sizeId)` and on `sku`.

All 7 imported products were backfilled with a default variant, and all 39
Drive images were linked to variants — **0 products without a variant, 39/39
images on variants.**

### Inventory ledger

`StockMovement` is append-only and records date · product · variant · quantity
· type · warehouse · location · reference · user · reason. Ten movement types,
each with a defined sign, so the operator types a positive number and the
system decides direction.

- Movements are **never deleted** — correction posts a reversal linked via
  `reversesId`, which is unique so a movement can be reversed exactly once
- `Stock` is a projection updated in the **same transaction** as the movement
- Negative balances are refused with a message pointing at `ADJUSTMENT`

### Soft delete

`isDeleted` + `deletedAt` on Product, ProductVariant, Category, Color, Size,
Material, PrintingOption, EmbroideryOption, Warehouse, WarehouseLocation,
Customer, Supplier. Transactional data is never deleted.

### CRUD UI — 19 routes

| Module | Routes |
|---|---|
| Products | `/products`, `/products/new`, `/products/[id]` (+ variants) |
| Catalogue | `/catalog/[kind]` — categories, colours, sizes, materials, printing, embroidery |
| Inventory | `/inventory` — balances, movement posting, movement log, reversal |
| Warehouses | `/warehouses` — warehouses + locations |
| Customers | `/customers`, `/customers/new`, `/customers/[id]` (+ timeline) |
| Suppliers | `/suppliers`, `/suppliers/new`, `/suppliers/[id]` (+ product links) |

Search, sort, paging and filtering are **URL-driven**, so a filtered list is
linkable, refresh-safe and works with the Back button.

### RBAC

Extended, not rebuilt: added `suppliers.read`, `suppliers.write`,
`catalog.manage`. **21 permissions, 48 grants.** Every mutating action calls
`requirePermission` server-side; nav links are filtered but the guard is the
security, not the hiding.

### Audit

Every create, update and soft delete writes an append-only `AuditLog` row with
actor, entity, detail and IP.

---

## ⚠ Partial

| Item | State |
|---|---|
| **Attachments** | Table, relations and UI section exist. **File upload is not implemented** — no storage backend is configured. |
| **QR codes** | `qrPayload` column exists on Product; no generator or label rendering yet. |
| **Customer relations to Quotations/Orders/Invoices** | Schema is *prepared* (Customer is stable and codeable) but those tables do not exist — they belong to Sales. |
| **Supplier purchase history** | `SupplierProduct` links products; `PurchaseOrder` does not exist yet. The page says so rather than showing an empty table. |
| **Product edit of variants** | Variants can be added and soft-deleted. Editing an existing variant in place is not built. |
| **Min/max stock editing** | Columns and the low-stock indicator work; the `setLevels` action exists but has no UI form yet. |

---

## ❌ Missing / deliberately not built

- **Manufacturing, Formula Engine, Cost Engine** — out of scope by directive
- **Sales, Purchasing, Accounting, Reports** — later phases
- **`cost` / `sellingPrice` arithmetic** — the columns store values, but no
  money is calculated anywhere. DI-3 prohibits float arithmetic in financial
  paths, and SQLite has no DECIMAL, so calculation waits for the Cost Engine.
- **Drive re-import** — the existing importer was not re-run this phase; no new
  Drive folders were added. Duplicate detection via unique `driveFileId` is in
  place and was verified idempotent in Phase 2.

---

## 🔴 Issues and risks

**1. SQLite instead of PostgreSQL — unchanged and still the biggest gap.**
ADR-002 requires row-level security for tenant isolation. SQLite has none, so
isolation is enforced only in the repository layer, which the ADR itself called
insufficient for production. Every query filters on `tenantId`, but a single
forgotten filter is a cross-tenant leak. **This must be resolved before real
data.**

**2. Money columns are `Float`.**
SQLite has no DECIMAL. Storage only for now, and nothing computes with them —
but they must become `NUMERIC(19,4)` on the Postgres migration before the Cost
Engine touches them.

**3. `next build` breaks a running `next dev`.**
Both share `.next`, so building while the dev server runs produces
`__webpack_modules__[moduleId] is not a function` until the dev server is
restarted. Cost time twice this phase. Worth a separate `distDir` for builds.

**4. A `'use server'` module may only export async functions.**
Exporting a constant from one is a *build* error that typecheck does not
catch — found only by `next build`. Constants were moved to
`inventory/types.ts` and `catalog/types.ts`.

**5. Prisma cannot target a compound unique containing a nullable column.**
`Stock`'s `(variantId, warehouseId, locationId)` includes an optional
location, so `upsert` on it does not type-check. Replaced with an explicit
find-then-write helper.

**6. Still zero automated tests in CI.**
`scripts/verify-phase3.mjs` is a real suite that passes 16/16, but it is run
by hand. NFR-20 requires 100% branch coverage on ledger, cost, tax and formula
— none of that exists yet.

---

## Verification evidence

```
PASS  lookups seeded — colors=10 sizes=7 materials=6 printing=5 embroidery=3
PASS  warehouses + locations — wh=1 loc=4
PASS  every product has ≥1 variant — orphans=0
PASS  images linked to variants — 39/39
PASS  product create
PASS  variant carries colour + size
PASS  duplicate colour+size rejected
PASS  duplicate variant SKU rejected
PASS  stock projection written — onHand=40
PASS  reversal preserves the original
PASS  double reversal rejected
PASS  search by Arabic name — 1 hit(s)
PASS  sort desc by sku
PASS  soft delete hides from lists
PASS  soft delete keeps the row
PASS  soft delete keeps movement history — 2 movements

16/16 passed
```

Also verified through the running UI: server-side validation returned three
correctly field-mapped Arabic errors on an invalid customer; a valid customer
persisted and redirected to its detail page; a stock receipt of 120 posted and
appeared in both the balance and the movement log.

---

## Change Log

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-08-08 | Phase 3 complete. 29 tables, 19 routes, 16/16 verification, all gates clean. |
