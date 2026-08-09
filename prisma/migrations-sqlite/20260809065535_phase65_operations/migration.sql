-- CreateTable
CREATE TABLE "SecondaryExpense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "expenseDate" DATETIME NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "employeeId" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "approvedById" TEXT,
    "approvedAt" DATETIME,
    "rejectReason" TEXT,
    "createdById" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SecondaryExpense_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SecondaryExpense_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SecondaryExpense_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SecondaryExpense_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DamageRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "damageDate" DATETIME NOT NULL,
    "employeeId" TEXT,
    "department" TEXT,
    "machine" TEXT,
    "productId" TEXT,
    "variantId" TEXT,
    "productionOrderId" TEXT,
    "quantity" DECIMAL NOT NULL,
    "reason" TEXT NOT NULL,
    "materialCost" DECIMAL NOT NULL DEFAULT 0,
    "laborCost" DECIMAL NOT NULL DEFAULT 0,
    "totalCost" DECIMAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approvedById" TEXT,
    "approvedAt" DATETIME,
    "rejectReason" TEXT,
    "createdById" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DamageRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DamageRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DamageRecord_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DamageRecord_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DamageRecord_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DamageRecord_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DamageRecord_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Penalty" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "damageId" TEXT,
    "employeeId" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "approvedById" TEXT,
    "approvedAt" DATETIME,
    "paidAt" DATETIME,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Penalty_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Penalty_damageId_fkey" FOREIGN KEY ("damageId") REFERENCES "DamageRecord" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Penalty_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Penalty_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Penalty_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PenaltyEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "penaltyId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "note" TEXT,
    "userId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PenaltyEvent_penaltyId_fkey" FOREIGN KEY ("penaltyId") REFERENCES "Penalty" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PenaltyEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Supply" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "unit" TEXT,
    "lastUnitCost" DECIMAL,
    "onHand" DECIMAL NOT NULL DEFAULT 0,
    "minStock" DECIMAL NOT NULL DEFAULT 0,
    "notes" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Supply_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SupplyTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "supplyId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "txDate" DATETIME NOT NULL,
    "quantity" DECIMAL NOT NULL,
    "unitCost" DECIMAL NOT NULL DEFAULT 0,
    "totalCost" DECIMAL NOT NULL DEFAULT 0,
    "productionOrderId" TEXT,
    "notes" TEXT,
    "userId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupplyTransaction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SupplyTransaction_supplyId_fkey" FOREIGN KEY ("supplyId") REFERENCES "Supply" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SupplyTransaction_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SupplyTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Attachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT,
    "supplierId" TEXT,
    "quotationId" TEXT,
    "salesOrderId" TEXT,
    "expenseId" TEXT,
    "damageId" TEXT,
    "filename" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "uploadedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Attachment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Attachment_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Attachment_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Attachment_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Attachment_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "SecondaryExpense" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Attachment_damageId_fkey" FOREIGN KEY ("damageId") REFERENCES "DamageRecord" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Attachment" ("bytes", "createdAt", "customerId", "filename", "id", "mimeType", "path", "quotationId", "salesOrderId", "supplierId", "uploadedBy") SELECT "bytes", "createdAt", "customerId", "filename", "id", "mimeType", "path", "quotationId", "salesOrderId", "supplierId", "uploadedBy" FROM "Attachment";
DROP TABLE "Attachment";
ALTER TABLE "new_Attachment" RENAME TO "Attachment";
CREATE INDEX "Attachment_customerId_idx" ON "Attachment"("customerId");
CREATE INDEX "Attachment_supplierId_idx" ON "Attachment"("supplierId");
CREATE INDEX "Attachment_quotationId_idx" ON "Attachment"("quotationId");
CREATE INDEX "Attachment_salesOrderId_idx" ON "Attachment"("salesOrderId");
CREATE INDEX "Attachment_expenseId_idx" ON "Attachment"("expenseId");
CREATE INDEX "Attachment_damageId_idx" ON "Attachment"("damageId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "SecondaryExpense_tenantId_isDeleted_idx" ON "SecondaryExpense"("tenantId", "isDeleted");

-- CreateIndex
CREATE INDEX "SecondaryExpense_tenantId_expenseDate_idx" ON "SecondaryExpense"("tenantId", "expenseDate");

-- CreateIndex
CREATE INDEX "SecondaryExpense_tenantId_status_idx" ON "SecondaryExpense"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SecondaryExpense_tenantId_number_key" ON "SecondaryExpense"("tenantId", "number");

-- CreateIndex
CREATE INDEX "DamageRecord_tenantId_isDeleted_idx" ON "DamageRecord"("tenantId", "isDeleted");

-- CreateIndex
CREATE INDEX "DamageRecord_tenantId_damageDate_idx" ON "DamageRecord"("tenantId", "damageDate");

-- CreateIndex
CREATE INDEX "DamageRecord_tenantId_status_idx" ON "DamageRecord"("tenantId", "status");

-- CreateIndex
CREATE INDEX "DamageRecord_productionOrderId_idx" ON "DamageRecord"("productionOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "DamageRecord_tenantId_number_key" ON "DamageRecord"("tenantId", "number");

-- CreateIndex
CREATE INDEX "Penalty_tenantId_status_idx" ON "Penalty"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Penalty_employeeId_idx" ON "Penalty"("employeeId");

-- CreateIndex
CREATE INDEX "Penalty_damageId_idx" ON "Penalty"("damageId");

-- CreateIndex
CREATE UNIQUE INDEX "Penalty_tenantId_number_key" ON "Penalty"("tenantId", "number");

-- CreateIndex
CREATE INDEX "PenaltyEvent_penaltyId_createdAt_idx" ON "PenaltyEvent"("penaltyId", "createdAt");

-- CreateIndex
CREATE INDEX "Supply_tenantId_isDeleted_idx" ON "Supply"("tenantId", "isDeleted");

-- CreateIndex
CREATE INDEX "Supply_tenantId_kind_idx" ON "Supply"("tenantId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Supply_tenantId_code_key" ON "Supply"("tenantId", "code");

-- CreateIndex
CREATE INDEX "SupplyTransaction_tenantId_txDate_idx" ON "SupplyTransaction"("tenantId", "txDate");

-- CreateIndex
CREATE INDEX "SupplyTransaction_supplyId_txDate_idx" ON "SupplyTransaction"("supplyId", "txDate");

-- CreateIndex
CREATE INDEX "SupplyTransaction_tenantId_type_idx" ON "SupplyTransaction"("tenantId", "type");

-- CreateIndex
CREATE INDEX "SupplyTransaction_productionOrderId_idx" ON "SupplyTransaction"("productionOrderId");

