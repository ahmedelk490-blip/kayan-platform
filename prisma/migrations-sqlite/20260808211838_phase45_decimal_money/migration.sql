-- Phase 4.5 — money and quantity: Float -> Decimal.
--
-- 41 columns across 9 tables. SQLite rebuilds each table and copies every
-- existing value first (the INSERT INTO new_* ... SELECT statements below),
-- so no data is lost. Verified by diffing a full value snapshot taken
-- before and after this migration.
--
-- On SQLite the column is created as DECIMAL but storage remains float-
-- backed; the gain is exact ARITHMETIC via Prisma.Decimal in the
-- application. On PostgreSQL these become true NUMERIC(19,4).
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "barcode" TEXT,
    "qrPayload" TEXT,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT,
    "descriptionAr" TEXT,
    "driveFolderId" TEXT,
    "cost" DECIMAL,
    "sellingPrice" DECIMAL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Product_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Product" ("barcode", "categoryId", "cost", "createdAt", "deletedAt", "descriptionAr", "driveFolderId", "id", "isDeleted", "nameAr", "nameEn", "qrPayload", "sellingPrice", "sku", "status", "tenantId", "updatedAt") SELECT "barcode", "categoryId", "cost", "createdAt", "deletedAt", "descriptionAr", "driveFolderId", "id", "isDeleted", "nameAr", "nameEn", "qrPayload", "sellingPrice", "sku", "status", "tenantId", "updatedAt" FROM "Product";
DROP TABLE "Product";
ALTER TABLE "new_Product" RENAME TO "Product";
CREATE INDEX "Product_tenantId_isDeleted_idx" ON "Product"("tenantId", "isDeleted");
CREATE INDEX "Product_tenantId_categoryId_idx" ON "Product"("tenantId", "categoryId");
CREATE INDEX "Product_barcode_idx" ON "Product"("barcode");
CREATE UNIQUE INDEX "Product_tenantId_sku_key" ON "Product"("tenantId", "sku");
CREATE TABLE "new_ProductVariant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "colorId" TEXT,
    "sizeId" TEXT,
    "sku" TEXT NOT NULL,
    "barcode" TEXT,
    "cost" DECIMAL,
    "sellingPrice" DECIMAL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductVariant_colorId_fkey" FOREIGN KEY ("colorId") REFERENCES "Color" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ProductVariant_sizeId_fkey" FOREIGN KEY ("sizeId") REFERENCES "Size" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ProductVariant" ("barcode", "colorId", "cost", "createdAt", "deletedAt", "id", "isActive", "isDeleted", "productId", "sellingPrice", "sizeId", "sku", "updatedAt") SELECT "barcode", "colorId", "cost", "createdAt", "deletedAt", "id", "isActive", "isDeleted", "productId", "sellingPrice", "sizeId", "sku", "updatedAt" FROM "ProductVariant";
DROP TABLE "ProductVariant";
ALTER TABLE "new_ProductVariant" RENAME TO "ProductVariant";
CREATE INDEX "ProductVariant_productId_idx" ON "ProductVariant"("productId");
CREATE INDEX "ProductVariant_barcode_idx" ON "ProductVariant"("barcode");
CREATE UNIQUE INDEX "ProductVariant_sku_key" ON "ProductVariant"("sku");
CREATE UNIQUE INDEX "ProductVariant_productId_colorId_sizeId_key" ON "ProductVariant"("productId", "colorId", "sizeId");
CREATE TABLE "new_Quotation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "salesRepId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "issueDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiryDate" DATETIME,
    "notes" TEXT,
    "subtotal" DECIMAL NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL NOT NULL DEFAULT 0,
    "discountPercent" DECIMAL NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL NOT NULL DEFAULT 0,
    "total" DECIMAL NOT NULL DEFAULT 0,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Quotation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Quotation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Quotation_salesRepId_fkey" FOREIGN KEY ("salesRepId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Quotation" ("createdAt", "customerId", "deletedAt", "discountAmount", "discountPercent", "expiryDate", "id", "isDeleted", "issueDate", "notes", "number", "salesRepId", "status", "subtotal", "taxAmount", "tenantId", "total", "updatedAt") SELECT "createdAt", "customerId", "deletedAt", "discountAmount", "discountPercent", "expiryDate", "id", "isDeleted", "issueDate", "notes", "number", "salesRepId", "status", "subtotal", "taxAmount", "tenantId", "total", "updatedAt" FROM "Quotation";
DROP TABLE "Quotation";
ALTER TABLE "new_Quotation" RENAME TO "Quotation";
CREATE INDEX "Quotation_tenantId_isDeleted_idx" ON "Quotation"("tenantId", "isDeleted");
CREATE INDEX "Quotation_tenantId_status_idx" ON "Quotation"("tenantId", "status");
CREATE INDEX "Quotation_customerId_idx" ON "Quotation"("customerId");
CREATE UNIQUE INDEX "Quotation_tenantId_number_key" ON "Quotation"("tenantId", "number");
CREATE TABLE "new_QuotationLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quotationId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL DEFAULT 1,
    "quantity" DECIMAL NOT NULL,
    "unitPrice" DECIMAL NOT NULL,
    "discountAmount" DECIMAL NOT NULL DEFAULT 0,
    "discountPercent" DECIMAL NOT NULL DEFAULT 0,
    "taxRate" DECIMAL NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL NOT NULL,
    "notes" TEXT,
    "costSnapshot" DECIMAL,
    "costSource" TEXT,
    "formulaVersion" TEXT,
    "grossProfit" DECIMAL,
    "marginPercent" DECIMAL,
    CONSTRAINT "QuotationLine_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QuotationLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QuotationLine_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_QuotationLine" ("costSnapshot", "costSource", "discountAmount", "discountPercent", "formulaVersion", "grossProfit", "id", "lineNo", "lineTotal", "marginPercent", "notes", "productId", "quantity", "quotationId", "taxAmount", "taxRate", "unitPrice", "variantId") SELECT "costSnapshot", "costSource", "discountAmount", "discountPercent", "formulaVersion", "grossProfit", "id", "lineNo", "lineTotal", "marginPercent", "notes", "productId", "quantity", "quotationId", "taxAmount", "taxRate", "unitPrice", "variantId" FROM "QuotationLine";
DROP TABLE "QuotationLine";
ALTER TABLE "new_QuotationLine" RENAME TO "QuotationLine";
CREATE INDEX "QuotationLine_quotationId_idx" ON "QuotationLine"("quotationId");
CREATE INDEX "QuotationLine_variantId_idx" ON "QuotationLine"("variantId");
CREATE TABLE "new_SalesOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "quotationId" TEXT,
    "salesRepId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "orderDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requiredDeliveryDate" DATETIME,
    "notes" TEXT,
    "subtotal" DECIMAL NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL NOT NULL DEFAULT 0,
    "discountPercent" DECIMAL NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL NOT NULL DEFAULT 0,
    "total" DECIMAL NOT NULL DEFAULT 0,
    "confirmedAt" DATETIME,
    "cancelledAt" DATETIME,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SalesOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SalesOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SalesOrder_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SalesOrder_salesRepId_fkey" FOREIGN KEY ("salesRepId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_SalesOrder" ("cancelledAt", "confirmedAt", "createdAt", "customerId", "deletedAt", "discountAmount", "discountPercent", "id", "isDeleted", "notes", "number", "orderDate", "quotationId", "requiredDeliveryDate", "salesRepId", "status", "subtotal", "taxAmount", "tenantId", "total", "updatedAt") SELECT "cancelledAt", "confirmedAt", "createdAt", "customerId", "deletedAt", "discountAmount", "discountPercent", "id", "isDeleted", "notes", "number", "orderDate", "quotationId", "requiredDeliveryDate", "salesRepId", "status", "subtotal", "taxAmount", "tenantId", "total", "updatedAt" FROM "SalesOrder";
DROP TABLE "SalesOrder";
ALTER TABLE "new_SalesOrder" RENAME TO "SalesOrder";
CREATE INDEX "SalesOrder_tenantId_isDeleted_idx" ON "SalesOrder"("tenantId", "isDeleted");
CREATE INDEX "SalesOrder_tenantId_status_idx" ON "SalesOrder"("tenantId", "status");
CREATE INDEX "SalesOrder_customerId_idx" ON "SalesOrder"("customerId");
CREATE UNIQUE INDEX "SalesOrder_tenantId_number_key" ON "SalesOrder"("tenantId", "number");
CREATE TABLE "new_SalesOrderLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "salesOrderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL DEFAULT 1,
    "quantity" DECIMAL NOT NULL,
    "unitPrice" DECIMAL NOT NULL,
    "discountAmount" DECIMAL NOT NULL DEFAULT 0,
    "discountPercent" DECIMAL NOT NULL DEFAULT 0,
    "taxRate" DECIMAL NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL NOT NULL,
    "notes" TEXT,
    "costSnapshot" DECIMAL,
    "costSource" TEXT,
    "formulaVersion" TEXT,
    "grossProfit" DECIMAL,
    "marginPercent" DECIMAL,
    CONSTRAINT "SalesOrderLine_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SalesOrderLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SalesOrderLine_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_SalesOrderLine" ("costSnapshot", "costSource", "discountAmount", "discountPercent", "formulaVersion", "grossProfit", "id", "lineNo", "lineTotal", "marginPercent", "notes", "productId", "quantity", "salesOrderId", "taxAmount", "taxRate", "unitPrice", "variantId") SELECT "costSnapshot", "costSource", "discountAmount", "discountPercent", "formulaVersion", "grossProfit", "id", "lineNo", "lineTotal", "marginPercent", "notes", "productId", "quantity", "salesOrderId", "taxAmount", "taxRate", "unitPrice", "variantId" FROM "SalesOrderLine";
DROP TABLE "SalesOrderLine";
ALTER TABLE "new_SalesOrderLine" RENAME TO "SalesOrderLine";
CREATE INDEX "SalesOrderLine_salesOrderId_idx" ON "SalesOrderLine"("salesOrderId");
CREATE INDEX "SalesOrderLine_variantId_idx" ON "SalesOrderLine"("variantId");
CREATE TABLE "new_Stock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "variantId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "locationId" TEXT,
    "onHand" DECIMAL NOT NULL DEFAULT 0,
    "reserved" DECIMAL NOT NULL DEFAULT 0,
    "damaged" DECIMAL NOT NULL DEFAULT 0,
    "minStock" DECIMAL NOT NULL DEFAULT 0,
    "maxStock" DECIMAL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Stock_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Stock_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Stock_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "WarehouseLocation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Stock" ("damaged", "id", "locationId", "maxStock", "minStock", "onHand", "reserved", "updatedAt", "variantId", "warehouseId") SELECT "damaged", "id", "locationId", "maxStock", "minStock", "onHand", "reserved", "updatedAt", "variantId", "warehouseId" FROM "Stock";
DROP TABLE "Stock";
ALTER TABLE "new_Stock" RENAME TO "Stock";
CREATE INDEX "Stock_variantId_idx" ON "Stock"("variantId");
CREATE INDEX "Stock_warehouseId_idx" ON "Stock"("warehouseId");
CREATE UNIQUE INDEX "Stock_variantId_warehouseId_locationId_key" ON "Stock"("variantId", "warehouseId", "locationId");
CREATE TABLE "new_StockMovement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "locationId" TEXT,
    "type" TEXT NOT NULL,
    "quantity" DECIMAL NOT NULL,
    "reference" TEXT,
    "reason" TEXT,
    "userId" TEXT,
    "salesOrderId" TEXT,
    "salesOrderLineId" TEXT,
    "reversesId" TEXT,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockMovement_reversesId_fkey" FOREIGN KEY ("reversesId") REFERENCES "StockMovement" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StockMovement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockMovement_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockMovement_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockMovement_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "WarehouseLocation" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StockMovement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StockMovement_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StockMovement_salesOrderLineId_fkey" FOREIGN KEY ("salesOrderLineId") REFERENCES "SalesOrderLine" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_StockMovement" ("createdAt", "id", "locationId", "occurredAt", "productId", "quantity", "reason", "reference", "reversesId", "salesOrderId", "salesOrderLineId", "tenantId", "type", "userId", "variantId", "warehouseId") SELECT "createdAt", "id", "locationId", "occurredAt", "productId", "quantity", "reason", "reference", "reversesId", "salesOrderId", "salesOrderLineId", "tenantId", "type", "userId", "variantId", "warehouseId" FROM "StockMovement";
DROP TABLE "StockMovement";
ALTER TABLE "new_StockMovement" RENAME TO "StockMovement";
CREATE UNIQUE INDEX "StockMovement_reversesId_key" ON "StockMovement"("reversesId");
CREATE INDEX "StockMovement_tenantId_occurredAt_idx" ON "StockMovement"("tenantId", "occurredAt");
CREATE INDEX "StockMovement_variantId_occurredAt_idx" ON "StockMovement"("variantId", "occurredAt");
CREATE INDEX "StockMovement_warehouseId_idx" ON "StockMovement"("warehouseId");
CREATE INDEX "StockMovement_type_idx" ON "StockMovement"("type");
CREATE INDEX "StockMovement_salesOrderId_idx" ON "StockMovement"("salesOrderId");
CREATE UNIQUE INDEX "StockMovement_salesOrderLineId_type_key" ON "StockMovement"("salesOrderLineId", "type");
CREATE TABLE "new_SupplierProduct" (
    "supplierId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "supplierSku" TEXT,
    "lastPrice" DECIMAL,
    "leadTimeDays" INTEGER,

    PRIMARY KEY ("supplierId", "productId"),
    CONSTRAINT "SupplierProduct_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SupplierProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_SupplierProduct" ("lastPrice", "leadTimeDays", "productId", "supplierId", "supplierSku") SELECT "lastPrice", "leadTimeDays", "productId", "supplierId", "supplierSku" FROM "SupplierProduct";
DROP TABLE "SupplierProduct";
ALTER TABLE "new_SupplierProduct" RENAME TO "SupplierProduct";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

