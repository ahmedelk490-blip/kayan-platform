# 13 — Database ER Diagram

**Version:** 1.0 · **Date:** 2026-08-08 · **Tables:** 29
**Source of truth:** `prisma/schema.prisma`

---

## 1. Catalogue and inventory

```mermaid
erDiagram
    Tenant ||--o{ Category : has
    Tenant ||--o{ Product : has
    Tenant ||--o{ Color : has
    Tenant ||--o{ Size : has
    Tenant ||--o{ Material : has
    Tenant ||--o{ PrintingOption : has
    Tenant ||--o{ EmbroideryOption : has
    Tenant ||--o{ Warehouse : has

    Category ||--o{ Category : "parent / subcategory"
    Category ||--o{ Product : classifies

    Product ||--o{ ProductVariant : "has (stock lives here)"
    Product ||--o{ ProductImage : has
    Product ||--o{ ProductMaterial : uses
    Product ||--o{ ProductPrintingOption : supports
    Product ||--o{ ProductEmbroideryOption : supports

    Material ||--o{ ProductMaterial : "in"
    PrintingOption ||--o{ ProductPrintingOption : "in"
    EmbroideryOption ||--o{ ProductEmbroideryOption : "in"

    Color ||--o{ ProductVariant : "colours"
    Size ||--o{ ProductVariant : "sizes"
    ProductVariant ||--o{ ProductImage : "variant-level images"

    Warehouse ||--o{ WarehouseLocation : contains
    ProductVariant ||--o{ Stock : "balance per warehouse+location"
    Warehouse ||--o{ Stock : holds
    WarehouseLocation ||--o{ Stock : holds

    ProductVariant ||--o{ StockMovement : "append-only ledger"
    Warehouse ||--o{ StockMovement : at
    WarehouseLocation ||--o{ StockMovement : at
    StockMovement ||--o| StockMovement : "reverses (1:1)"
```

**The load-bearing decision:** `Stock` and `StockMovement` both hang off
`ProductVariant`, never off `Product`. A product in three colours and five
sizes is fifteen independently stocked things; tracking at product level makes
every figure meaningless.

`Stock` is a **projection** — a running balance kept beside the movement
ledger so a list page need not sum history. `StockMovement` is the record of
truth and is rebuildable into `Stock` at any time (DI-2).

---

## 2. Partners

```mermaid
erDiagram
    Tenant ||--o{ Customer : has
    Tenant ||--o{ Supplier : has

    Customer ||--o{ CustomerActivity : "timeline"
    Customer ||--o{ Attachment : has
    Supplier ||--o{ Attachment : has
    Supplier ||--o{ SupplierProduct : supplies
    Product ||--o{ SupplierProduct : "supplied by"
    User ||--o{ CustomerActivity : records
```

`Attachment` uses **nullable foreign keys** (`customerId`, `supplierId`)
rather than an `entityType` + `entityId` pair, so the database still enforces
referential integrity. Exactly one owner is set per row.

---

## 3. Identity — frozen at Phase 2

```mermaid
erDiagram
    Tenant ||--o{ User : has
    Tenant ||--o{ Company : has
    Role ||--o{ User : assigned
    Role ||--o{ RolePermission : grants
    Permission ||--o{ RolePermission : "in"
    User ||--o{ Session : "server-side registry"
    User ||--o{ AuditLog : acts
    User ||--o{ StockMovement : posts
```

---

## 3b. Manufacturing — Phase 5

```
Customer ──0..1─────┐
SalesOrder ─0..1────┤
SalesOrderLine ─0..1┤
                    ▼
Product ──1───► ProductionOrder ◄───1── ProductVariant
                    │  │
                    │  └──1..*──► WorkOrder            (sequence, status)
                    │  └──0..*──► ProductionOrderAssignee ──► User
                    │
                    └──0..*──► StockMovement           (RECEIPT on completion)
```

A production order is always for exactly one variant and one quantity.
Producing a sales order in batches means creating several production orders,
which is what a factory actually does.

`salesOrderId`, `salesOrderLineId` and `customerId` are all nullable — an
order raised to replenish stock has no customer at all.

`ProductionOrderAssignee` has a composite key `(productionOrderId, userId)`.
The relation exists; there is no assignment UI yet.

---

## 4. Constraints and indexes

| Table | Unique | Indexes |
|---|---|---|
| `Category` | `(tenantId, slug)` | `(tenantId, isDeleted)`, `parentId` |
| `Product` | `(tenantId, sku)` | `(tenantId, isDeleted)`, `(tenantId, categoryId)`, `barcode` |
| `ProductVariant` | `sku`, `(productId, colorId, sizeId)` | `productId`, `barcode` |
| `ProductImage` | `driveFileId` | `productId`, `variantId` |
| `Color` / `Material` / `PrintingOption` / `EmbroideryOption` | `(tenantId, nameAr)` | `(tenantId, isDeleted)` |
| `Size` | `(tenantId, code)` | `(tenantId, isDeleted)` |
| `Warehouse` | `(tenantId, code)` | `(tenantId, isDeleted)` |
| `WarehouseLocation` | `(warehouseId, code)` | `warehouseId` |
| `Stock` | `(variantId, warehouseId, locationId)` | `variantId`, `warehouseId` |
| `StockMovement` | `reversesId`, `(salesOrderLineId, type)`, `(productionOrderId, type)` | `(tenantId, occurredAt)`, `(variantId, occurredAt)`, `warehouseId`, `type` |
| `Customer` / `Supplier` | `(tenantId, code)` | `(tenantId, isDeleted)`, `phone` |
| `ProductionOrder` | `(tenantId, number)` | `(tenantId, isDeleted)`, `(tenantId, status)`, `salesOrderId`, `variantId` |
| `ProductionOrderAssignee` | PK `(productionOrderId, userId)` | — |
| `WorkOrder` | `(productionOrderId, sequence)` | `productionOrderId` |

`ProductImage.driveFileId` being unique is what makes the Drive import
idempotent — the same file can never be imported twice.

`StockMovement.reversesId` being unique means a movement can be reversed
exactly once, which the verification suite tests directly.

The two compound uniques on `StockMovement` are what make reservation
(Phase 4) and the finished-goods receipt (Phase 5) idempotent. Both are
enforced by the database, not by an application check, so a duplicate cannot
slip through under concurrency. The Phase 5 suite proves this by attempting a
second `RECEIPT` outside the application and confirming the write is rejected.

---

## 5. Soft delete

`isDeleted` + `deletedAt` on: **Product, ProductVariant, Category, Color,
Size, Material, PrintingOption, EmbroideryOption, Warehouse,
WarehouseLocation, Customer, Supplier, Quotation, SalesOrder,
ProductionOrder.**

Transactional data — `StockMovement`, `AuditLog`, `CustomerActivity` — is
never deleted at all. Corrections are reversing entries.

A production order can only be soft-deleted while it is `DRAFT` or already
`CANCELLED`. One that has reached the floor must be cancelled, not hidden.

---

## 6. Change Log

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-08-08 | Initial diagram at 29 tables after the Phase 3 migration. |
| 1.1 | 2026-08-09 | Phase 5: `ProductionOrder`, `ProductionOrderAssignee`, `WorkOrder`; `StockMovement.productionOrderId` and its unique constraint. 36 tables. |
