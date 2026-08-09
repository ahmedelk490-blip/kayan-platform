import 'server-only';

import type { Prisma, PrismaClient } from '@prisma/client';
import {
  computeCost,
  dec,
  type CostBasis,
  type CostCategory,
  type CostResult,
  type EngineLine,
} from '@erp/domain';
import { prisma } from './prisma';

/**
 * The bridge between the pure Cost Engine and the database.
 *
 * The engine itself knows nothing about Prisma (Article 1). This module does
 * two things and nothing else: gather the published formula versions that
 * apply to a variant, and write the result down as an immutable snapshot.
 */

export interface GatheredFormulas {
  lines: EngineLine[];
  params: Record<string, number>;
  /** One entry per formula version consulted, even if it contributed no lines. */
  used: {
    formulaId: string;
    formulaVersionId: string;
    version: number;
    formulaCode: string;
    formulaNameAr: string;
    kind: string;
  }[];
  /** Formulas assigned but not costable, with the reason. */
  skipped: { code: string; nameAr: string; reason: string }[];
}

/**
 * Every published formula that applies to this variant.
 *
 * A formula assigned with `variantId = null` covers all variants of the
 * product; one assigned to a specific variant covers only that. Both apply
 * together — a base manufacturing recipe plus a printing formula plus an
 * embroidery formula is the normal case, not an edge case.
 *
 * An assigned formula with no published version is *skipped and reported*,
 * never silently ignored: a cost that quietly omits a whole formula is worse
 * than no cost at all.
 */
export async function gatherFormulas(
  tenantId: string,
  productId: string,
  variantId: string,
): Promise<GatheredFormulas> {
  const assignments = await prisma.productFormula.findMany({
    where: {
      productId,
      OR: [{ variantId: null }, { variantId }],
      formula: { tenantId, isDeleted: false },
    },
    include: {
      formula: {
        include: {
          currentVersion: {
            include: {
              lines: { orderBy: { sequence: 'asc' } },
              params: true,
            },
          },
        },
      },
    },
    orderBy: { formula: { code: 'asc' } },
  });

  const lines: EngineLine[] = [];
  const params: Record<string, number> = {};
  const used: GatheredFormulas['used'] = [];
  const skipped: GatheredFormulas['skipped'] = [];

  assignments.forEach((assignment, index) => {
    const formula = assignment.formula;
    const version = formula.currentVersion;

    if (!version) {
      skipped.push({
        code: formula.code,
        nameAr: formula.nameAr,
        reason: 'لا يوجد إصدار منشور',
      });
      return;
    }
    if (version.status !== 'PUBLISHED') {
      skipped.push({
        code: formula.code,
        nameAr: formula.nameAr,
        reason: `الإصدار ${version.version} ليس منشوراً`,
      });
      return;
    }

    used.push({
      formulaId: formula.id,
      formulaVersionId: version.id,
      version: version.version,
      formulaCode: formula.code,
      formulaNameAr: formula.nameAr,
      kind: formula.kind,
    });

    // Parameters merge across formulas. Assignments are ordered by formula
    // code, so a collision resolves the same way every time rather than
    // depending on insertion order.
    for (const param of version.params) {
      params[param.key] = Number(param.value.toString());
    }

    for (const line of version.lines) {
      lines.push({
        id: line.id,
        formulaId: formula.id,
        formulaVersionId: version.id,
        version: version.version,
        // Keeps each formula's lines together and in its own order, while
        // still giving the engine one globally ordered list.
        sequence: index * 1000 + line.sequence,
        category: line.category as CostCategory,
        nameAr: line.nameAr,
        basis: line.basis as CostBasis,
        unit: line.unit,
        quantityPerBasis: line.quantity,
        yieldQty: line.yieldQty,
        unitCost: line.unitCost,
      });
    }
  });

  return { lines, params, used, skipped };
}

export interface SaveCostInput {
  tenantId: string;
  productId: string;
  variantId: string;
  quantity: Prisma.Decimal | number | string;
  kind: 'ESTIMATE' | 'ACTUAL';
  productionOrderId?: string | null;
  salesOrderLineId?: string | null;
  targetMarginPercent?: number | null;
  computedById?: string | null;
  notes?: string | null;
}

/**
 * Compute and persist a cost snapshot.
 *
 * Every input is copied into the snapshot rather than referenced, so the
 * calculation still explains itself after the formula moves on. Each call
 * writes a NEW row — nothing is ever recomputed in place, which is what
 * makes "changing the formula does not affect old calculations" true by
 * construction rather than by discipline.
 */
export async function saveCostCalculation(
  input: SaveCostInput,
  gathered: GatheredFormulas,
  result: CostResult,
) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const calculation = await tx.costCalculation.create({
      data: {
        tenantId: input.tenantId,
        productionOrderId: input.productionOrderId ?? null,
        salesOrderLineId: input.salesOrderLineId ?? null,
        productId: input.productId,
        variantId: input.variantId,
        quantity: input.quantity,
        kind: input.kind,

        materialCost: result.byCategory.MATERIAL.toString(),
        inkCost: result.byCategory.INK.toString(),
        threadCost: result.byCategory.THREAD.toString(),
        laborCost: result.byCategory.LABOR.toString(),
        packagingCost: result.byCategory.PACKAGING.toString(),
        machineCost: result.byCategory.MACHINE.toString(),
        overheadCost: result.byCategory.OVERHEAD.toString(),
        wasteCost: result.byCategory.WASTE.toString(),

        directCost: result.directCost.toString(),
        indirectCost: result.indirectCost.toString(),
        totalCost: result.totalCost.toString(),
        costPerPiece: result.costPerPiece.toString(),
        totalMinutes: result.totalMinutes.toString(),

        targetMarginPercent: input.targetMarginPercent ?? null,
        suggestedPrice: result.suggestedPrice ? result.suggestedPrice.toString() : null,
        notes: input.notes ?? null,
        computedById: input.computedById ?? null,
      },
    });

    if (gathered.used.length > 0) {
      await tx.costCalculationFormula.createMany({
        data: gathered.used.map((u) => ({
          costCalculationId: calculation.id,
          formulaId: u.formulaId,
          formulaVersionId: u.formulaVersionId,
          version: u.version,
          formulaCode: u.formulaCode,
          formulaNameAr: u.formulaNameAr,
          kind: u.kind,
        })),
      });
    }

    // Re-sequenced 1..n so the snapshot reads as its own document rather
    // than carrying the gaps left by the source formulas' numbering.
    if (result.lines.length > 0) {
      await tx.costCalculationLine.createMany({
        data: result.lines.map((line, i) => ({
          costCalculationId: calculation.id,
          sequence: i + 1,
          formulaId: line.formulaId,
          formulaVersionId: line.formulaVersionId,
          version: line.version,
          category: line.category,
          nameAr: line.nameAr,
          basis: line.basis,
          unit: line.unit,
          quantityPerBasis: line.quantityPerBasis.toString(),
          yieldQty: line.yieldQty ? line.yieldQty.toString() : null,
          unitCost: line.unitCost.toString(),
          consumedQty: line.consumedQty.toString(),
          lineCost: line.lineCost.toString(),
        })),
      });
    }

    return calculation;
  });
}

/**
 * Cost a variant end to end: gather, compute, persist.
 *
 * Returns the gathered formulas alongside the row so the caller can report
 * what was skipped — the UI has to say so, not swallow it.
 */
export async function costVariant(input: SaveCostInput) {
  const gathered = await gatherFormulas(input.tenantId, input.productId, input.variantId);

  const result = computeCost({
    quantity: dec(input.quantity as never),
    lines: gathered.lines,
    params: gathered.params,
    targetMarginPercent: input.targetMarginPercent ?? null,
  });

  const calculation = await saveCostCalculation(input, gathered, result);
  return { calculation, gathered, result };
}

export type { PrismaClient };
