'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { can } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { audit } from '@/lib/audit';
import { costVariant } from '@/lib/cost';

/**
 * Calculate a cost for a production order and store it as a snapshot.
 *
 * Every call writes a NEW CostCalculation. Nothing is recomputed in place,
 * so an old calculation keeps saying what it said — which is what makes
 * "changing a formula does not affect old costs" a property of the data
 * rather than a promise about behaviour.
 *
 * `kind` is ESTIMATE while the order is live and ACTUAL once it is complete.
 * Both are computed the same way today: without material-issue records there
 * is nothing that would make an actual differ from an estimate, and
 * pretending otherwise would be inventing a number.
 */
export async function calculateProductionCost(
  productionOrderId: string,
  formData: FormData,
): Promise<void> {
  // Writing to a production order and seeing cost are different rights, and
  // this action does both.
  const user = await requirePermission('manufacturing.write');
  if (!can(user.role, 'cost.view')) redirect(`/manufacturing/${productionOrderId}`);

  const order = await prisma.productionOrder.findFirst({
    where: { id: productionOrderId, tenantId: user.tenantId, isDeleted: false },
  });
  if (!order) redirect('/manufacturing');

  const raw = String(formData.get('targetMarginPercent') ?? '').trim();
  const parsed = Number(raw);
  // Out-of-range or non-numeric means "no target", not a silent zero.
  const targetMarginPercent =
    raw !== '' && Number.isFinite(parsed) && parsed >= 0 && parsed < 100 ? parsed : null;

  const kind = order.status === 'COMPLETED' ? 'ACTUAL' : 'ESTIMATE';

  const { calculation, gathered } = await costVariant({
    tenantId: user.tenantId,
    productId: order.productId,
    variantId: order.variantId,
    quantity: order.quantity,
    kind,
    productionOrderId: order.id,
    targetMarginPercent,
    computedById: user.id,
  });

  // Mirror the headline figure onto the order so lists and dashboards do not
  // have to join. The snapshot remains the record of truth.
  await prisma.productionOrder.update({
    where: { id: order.id },
    data:
      kind === 'ACTUAL'
        ? { actualCost: calculation.totalCost }
        : { estimatedCost: calculation.totalCost },
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'cost.calculate',
    entityType: 'ProductionOrder',
    entityId: order.id,
    detail: `${kind} ${calculation.totalCost.toString()} — ${gathered.used
      .map((u) => `${u.formulaCode} v${u.version}`)
      .join(', ') || 'no formulas'}`,
  });

  revalidatePath(`/manufacturing/${order.id}`);
  revalidatePath('/manufacturing');
}
