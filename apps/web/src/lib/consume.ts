import 'server-only';

import { planConsumption, type ConsumptionPlan } from '@erp/domain';
import { withTenant } from './prisma';

/**
 * خصم المستلزمات لأمر إنتاج — الكتابة الفعلية في الدفتر.
 *
 * الحساب في `@erp/domain/consumption` ومُثبَت بـ14 تأكيداً. هذا الملف
 * يكتب ما حُسب هناك ولا يحسب شيئاً بنفسه، فلا توجد نسختان من المنطق
 * تتباعدان.
 *
 * ── ثلاثة ضمانات ──────────────────────────────────────────
 *
 * **ذرّية.** الحركات وتحديث الأرصدة في معاملة واحدة. نصف خصم أسوأ من لا
 * خصم: رصيد ينقص بلا حركة تفسّره لا يمكن تدقيقه ولا عكسه.
 *
 * **بلا تكرار.** قيد فريد على (أمر الإنتاج، المستلزم، النوع). فحص في
 * التطبيق يمرّ عليه طلبان متزامنان معاً؛ القيد لا يمرّ عليه اثنان.
 *
 * **ملحقة لا محرَّرة.** الدفتر يُضاف إليه ولا يُعدَّل. التصحيح حركة عكسية
 * تُرى في التاريخ، لا سطر يُمحى منه.
 *
 * ── ما لا يفعله ───────────────────────────────────────────
 *
 * لا يمنع الخصم عند نقص الرصيد. المصنع قد ينفّذ طلباً برصيد يظهر ناقصاً
 * لأن الجرد متأخّر، ومنعُه يوقف إنتاجاً حقيقياً لأجل رقم. يُبلَّغ في
 * `plan.blocked` والقرار للإنسان — لكن `allowNegative: false` (الافتراضي)
 * يجعله يرفض، فمن يريد التنفيذ يقولها صراحةً.
 */

export interface ConsumeResult {
  plan: ConsumptionPlan;
  /** عدد الحركات المكتوبة. صفر يعني أنها كانت مكتوبة من قبل. */
  written: number;
  alreadyDone: boolean;
}

export async function consumeForProduction(options: {
  tenantId: string;
  userId: string;
  productionOrderId: string;
  lines: Parameters<typeof planConsumption>[0];
  quantity: Parameters<typeof planConsumption>[1];
  supplies: Parameters<typeof planConsumption>[2];
  params?: Parameters<typeof planConsumption>[3];
  allowNegative?: boolean;
}): Promise<ConsumeResult> {
  const {
    tenantId,
    userId,
    productionOrderId,
    lines,
    quantity,
    supplies,
    params = {},
    allowNegative = false,
  } = options;

  const plan = planConsumption(lines, quantity, supplies, params);

  if (plan.blocked && !allowNegative) {
    return { plan, written: 0, alreadyDone: false };
  }
  if (plan.deductions.length === 0) {
    return { plan, written: 0, alreadyDone: false };
  }

  return withTenant(tenantId, async (tx) => {
    // خُصم من قبل؟ الفحص هنا لتقرير الحالة بوضوح، والقيد الفريد هو ما
    // يمنع فعلاً — هذا يوفّر رمي استثناء في الحالة الشائعة لا أكثر.
    const existing = await tx.supplyTransaction.count({
      where: { productionOrderId, type: 'CONSUME' },
    });
    if (existing > 0) return { plan, written: 0, alreadyDone: true };

    const now = new Date();
    let written = 0;

    for (const d of plan.deductions) {
      await tx.supplyTransaction.create({
        data: {
          tenantId,
          supplyId: d.supplyId,
          type: 'CONSUME',
          txDate: now,
          // موجبة في الدفتر، والنوع هو ما يحدّد الاتجاه. كمية سالبة مع
          // نوع "استهلاك" تعني إضافة، وهي حالة يصعب قراءتها في تقرير.
          quantity: d.quantity.toFixed(4),
          productionOrderId,
          userId,
          notes: `استهلاك تلقائي — ${d.quantity.toFixed(4)} ${d.unit ?? ''}`.trim(),
        },
      });

      await tx.supply.update({
        where: { id: d.supplyId },
        // decrement ذرّي على مستوى قاعدة البيانات: قراءة ثم كتابة تفقد
        // خصماً حين يجري أمران معاً.
        data: { onHand: { decrement: d.quantity.toFixed(4) } },
      });

      written += 1;
    }

    return { plan, written, alreadyDone: false };
  });
}
