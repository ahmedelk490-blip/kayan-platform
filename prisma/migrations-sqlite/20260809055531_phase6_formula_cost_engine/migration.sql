-- CreateTable
CREATE TABLE "Formula" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "notes" TEXT,
    "currentVersionId" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Formula_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Formula_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "FormulaVersion" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FormulaVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "formulaId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "publishedAt" DATETIME,
    "publishedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FormulaVersion_formulaId_fkey" FOREIGN KEY ("formulaId") REFERENCES "Formula" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FormulaVersion_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FormulaLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "formulaVersionId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "materialId" TEXT,
    "basis" TEXT NOT NULL,
    "quantity" DECIMAL NOT NULL,
    "yieldQty" DECIMAL,
    "unit" TEXT,
    "unitCost" DECIMAL NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FormulaLine_formulaVersionId_fkey" FOREIGN KEY ("formulaVersionId") REFERENCES "FormulaVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FormulaLine_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FormulaParam" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "formulaVersionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "value" DECIMAL NOT NULL DEFAULT 0,
    "unit" TEXT,
    CONSTRAINT "FormulaParam_formulaVersionId_fkey" FOREIGN KEY ("formulaVersionId") REFERENCES "FormulaVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductFormula" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "formulaId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductFormula_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductFormula_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductFormula_formulaId_fkey" FOREIGN KEY ("formulaId") REFERENCES "Formula" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CostCalculation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "productionOrderId" TEXT,
    "salesOrderLineId" TEXT,
    "productId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "quantity" DECIMAL NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'ESTIMATE',
    "materialCost" DECIMAL NOT NULL DEFAULT 0,
    "inkCost" DECIMAL NOT NULL DEFAULT 0,
    "threadCost" DECIMAL NOT NULL DEFAULT 0,
    "laborCost" DECIMAL NOT NULL DEFAULT 0,
    "packagingCost" DECIMAL NOT NULL DEFAULT 0,
    "machineCost" DECIMAL NOT NULL DEFAULT 0,
    "overheadCost" DECIMAL NOT NULL DEFAULT 0,
    "wasteCost" DECIMAL NOT NULL DEFAULT 0,
    "directCost" DECIMAL NOT NULL DEFAULT 0,
    "indirectCost" DECIMAL NOT NULL DEFAULT 0,
    "totalCost" DECIMAL NOT NULL DEFAULT 0,
    "costPerPiece" DECIMAL NOT NULL DEFAULT 0,
    "totalMinutes" DECIMAL NOT NULL DEFAULT 0,
    "targetMarginPercent" DECIMAL,
    "suggestedPrice" DECIMAL,
    "notes" TEXT,
    "computedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "computedById" TEXT,
    CONSTRAINT "CostCalculation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CostCalculation_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CostCalculation_salesOrderLineId_fkey" FOREIGN KEY ("salesOrderLineId") REFERENCES "SalesOrderLine" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CostCalculation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CostCalculation_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CostCalculation_computedById_fkey" FOREIGN KEY ("computedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CostCalculationFormula" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "costCalculationId" TEXT NOT NULL,
    "formulaId" TEXT NOT NULL,
    "formulaVersionId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "formulaCode" TEXT NOT NULL,
    "formulaNameAr" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    CONSTRAINT "CostCalculationFormula_costCalculationId_fkey" FOREIGN KEY ("costCalculationId") REFERENCES "CostCalculation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CostCalculationFormula_formulaVersionId_fkey" FOREIGN KEY ("formulaVersionId") REFERENCES "FormulaVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CostCalculationLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "costCalculationId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "formulaId" TEXT NOT NULL,
    "formulaVersionId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "basis" TEXT NOT NULL,
    "unit" TEXT,
    "quantityPerBasis" DECIMAL NOT NULL,
    "yieldQty" DECIMAL,
    "unitCost" DECIMAL NOT NULL,
    "consumedQty" DECIMAL NOT NULL,
    "lineCost" DECIMAL NOT NULL,
    CONSTRAINT "CostCalculationLine_costCalculationId_fkey" FOREIGN KEY ("costCalculationId") REFERENCES "CostCalculation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CostCalculationLine_formulaVersionId_fkey" FOREIGN KEY ("formulaVersionId") REFERENCES "FormulaVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Formula_currentVersionId_key" ON "Formula"("currentVersionId");

-- CreateIndex
CREATE INDEX "Formula_tenantId_isDeleted_idx" ON "Formula"("tenantId", "isDeleted");

-- CreateIndex
CREATE INDEX "Formula_tenantId_kind_idx" ON "Formula"("tenantId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Formula_tenantId_code_key" ON "Formula"("tenantId", "code");

-- CreateIndex
CREATE INDEX "FormulaVersion_formulaId_status_idx" ON "FormulaVersion"("formulaId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FormulaVersion_formulaId_version_key" ON "FormulaVersion"("formulaId", "version");

-- CreateIndex
CREATE INDEX "FormulaLine_formulaVersionId_idx" ON "FormulaLine"("formulaVersionId");

-- CreateIndex
CREATE INDEX "FormulaLine_materialId_idx" ON "FormulaLine"("materialId");

-- CreateIndex
CREATE UNIQUE INDEX "FormulaLine_formulaVersionId_sequence_key" ON "FormulaLine"("formulaVersionId", "sequence");

-- CreateIndex
CREATE INDEX "FormulaParam_formulaVersionId_idx" ON "FormulaParam"("formulaVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "FormulaParam_formulaVersionId_key_key" ON "FormulaParam"("formulaVersionId", "key");

-- CreateIndex
CREATE INDEX "ProductFormula_productId_idx" ON "ProductFormula"("productId");

-- CreateIndex
CREATE INDEX "ProductFormula_formulaId_idx" ON "ProductFormula"("formulaId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductFormula_productId_variantId_formulaId_key" ON "ProductFormula"("productId", "variantId", "formulaId");

-- CreateIndex
CREATE INDEX "CostCalculation_tenantId_computedAt_idx" ON "CostCalculation"("tenantId", "computedAt");

-- CreateIndex
CREATE INDEX "CostCalculation_productionOrderId_idx" ON "CostCalculation"("productionOrderId");

-- CreateIndex
CREATE INDEX "CostCalculation_salesOrderLineId_idx" ON "CostCalculation"("salesOrderLineId");

-- CreateIndex
CREATE INDEX "CostCalculation_variantId_idx" ON "CostCalculation"("variantId");

-- CreateIndex
CREATE INDEX "CostCalculationFormula_costCalculationId_idx" ON "CostCalculationFormula"("costCalculationId");

-- CreateIndex
CREATE UNIQUE INDEX "CostCalculationFormula_costCalculationId_formulaVersionId_key" ON "CostCalculationFormula"("costCalculationId", "formulaVersionId");

-- CreateIndex
CREATE INDEX "CostCalculationLine_costCalculationId_idx" ON "CostCalculationLine"("costCalculationId");

-- CreateIndex
CREATE UNIQUE INDEX "CostCalculationLine_costCalculationId_sequence_key" ON "CostCalculationLine"("costCalculationId", "sequence");

