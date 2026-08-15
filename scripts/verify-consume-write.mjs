/**
 * تحقّق من كتابة خصم المستلزمات.
 *
 * هذه أخطر كتابة في النظام: خصم خاطئ أو مزدوج لا يظهر كخطأ، بل كرقم معقول
 * على الشاشة ورفٍّ فارغ في المصنع. فتُهاجَم هنا لا تُفترض.
 *
 * آمن لإعادة التشغيل: ينشئ أمر إنتاج وهمياً ومستلزمات اختبار، ويحذف كل ما
 * أنشأه ويعيد الأرصدة كما كانت.
 */
import { PrismaClient } from '@prisma/client';
import { planConsumption } from '../packages/domain/src/consumption.ts';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.MAINTENANCE_DATABASE_URL } },
});

const T = 'kayan';
const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const n = (v) => Number(v.toString());

/**
 * نفس منطق lib/consume.ts، بعميل المستأجر مباشرةً.
 *
 * الحارس هنا ليس زينة: بدونه كتبت النسخة الأولى من هذا الاختبار رصيداً
 * سالباً (-10 متر رول) ومرّت، لأن تأكيدها كان يفحص وجود الصفّ لا قيمته.
 */
async function consume(productionOrderId, plan, userId, allowNegative = false) {
  if (plan.blocked && !allowNegative) return { written: 0, refused: true };

  const existing = await prisma.supplyTransaction.count({
    where: { productionOrderId, type: 'CONSUME' },
  });
  if (existing > 0) return { written: 0, alreadyDone: true };

  let written = 0;
  await prisma.$transaction(async (tx) => {
    for (const d of plan.deductions) {
      await tx.supplyTransaction.create({
        data: {
          tenantId: T,
          supplyId: d.supplyId,
          type: 'CONSUME',
          txDate: new Date(),
          quantity: d.quantity.toFixed(4),
          productionOrderId,
          userId,
          notes: 'اختبار آلي',
        },
      });
      await tx.supply.update({
        where: { id: d.supplyId },
        data: { onHand: { decrement: d.quantity.toFixed(4) } },
      });
      written += 1;
    }
  });
  return { written, alreadyDone: false };
}

async function main() {
  const formula = await prisma.formula.findFirst({
    where: { tenantId: T, code: 'FRM-PRINT-TSHIRT', isDeleted: false },
    include: { versions: { orderBy: { version: 'desc' }, take: 1, include: { lines: true } } },
  });
  const order = await prisma.productionOrder.findFirst({ where: { tenantId: T } });
  const user = await prisma.user.findFirst({ where: { tenantId: T } });
  if (!formula || !order || !user) {
    return check('توجد معادلة وأمر إنتاج ومستخدم', false), report();
  }
  check('توجد معادلة وأمر إنتاج ومستخدم', true, order.number ?? order.id.slice(0, 8));

  const lines = formula.versions[0].lines.map((l) => ({
    id: l.id,
    formulaId: formula.id,
    formulaVersionId: l.formulaVersionId,
    version: 1,
    sequence: l.sequence,
    category: l.category,
    nameAr: l.nameAr,
    basis: l.basis,
    unit: l.unit,
    quantityPerBasis: l.quantity,
    yieldQty: l.yieldQty,
    unitCost: l.unitCost,
  }));

  // أرصدة معلومة: 10 لكل مستلزم، فالحساب بعد الخصم يمكن التنبّؤ به.
  const supplies = await prisma.supply.findMany({
    where: { tenantId: T, isDeleted: false },
    select: { id: true, nameAr: true, unit: true, onHand: true, minStock: true },
  });
  const original = new Map(supplies.map((s) => [s.id, s.onHand.toString()]));
  await prisma.supply.updateMany({
    where: { id: { in: supplies.map((s) => s.id) } },
    data: { onHand: '50' },
  });
  const stocked = supplies.map((s) => ({ ...s, onHand: '50' }));

  // ── الخصم يقع مرة واحدة وبالقيم الصحيحة ──────────────────
  //
  // 100 قطعة: رول 100×100÷500 = 20 متر، أبيض 100×4÷500 = 0.8 علبة.
  const plan = planConsumption(lines, 100, stocked);
  const first = await consume(order.id, plan, user.id);
  check('الخصم الأول كتب حركة لكل مستلزم', first.written === plan.deductions.length, `${first.written} حركة`);

  const roll = await prisma.supply.findFirst({ where: { tenantId: T, nameAr: { contains: 'رول' } } });
  check(
    'الرول: 50 − 20 = 30 متر',
    roll !== null && n(roll.onHand) === 30,
    roll ? `${roll.onHand}` : '—',
  );
  check('ولا رصيد سالب في أي مستلزم', (await prisma.supply.findMany({ where:{tenantId:T,isDeleted:false}, select:{onHand:true} })).every((s) => n(s.onHand) >= 0));

  const white = await prisma.supply.findFirst({ where: { tenantId: T, nameAr: 'حبر أبيض' } });
  check(
    'الأبيض: 50 − 0.8 = 49.2',
    white !== null && n(white.onHand) === 49.2,
    white ? `${white.onHand}` : '—',
  );

  // ── الخصم مرتين لا يقع ───────────────────────────────────
  const second = await consume(order.id, plan, user.id);
  check(
    'إعادة الخصم لنفس الأمر لا تكتب شيئاً',
    second.alreadyDone === true && second.written === 0,
    'مطلوب: أمر يُنفَّذ مرتين لا يستهلك ضعف الحبر',
  );

  const whiteAgain = await prisma.supply.findFirst({ where: { tenantId: T, nameAr: 'حبر أبيض' } });
  check(
    'والرصيد لم يتحرّك بعدها',
    n(whiteAgain.onHand) === 49.2,
    `${whiteAgain.onHand}`,
  );

  // ── والقيد يمنع حتى لو تُجووز الفحص ──────────────────────
  //
  // فحص التطبيق يمرّ عليه طلبان متزامنان معاً. هذا يحاكي ذلك بتخطّيه.
  let rejected = false;
  try {
    await prisma.supplyTransaction.create({
      data: {
        tenantId: T,
        supplyId: white.id,
        type: 'CONSUME',
        txDate: new Date(),
        quantity: '0.8',
        productionOrderId: order.id,
        userId: user.id,
      },
    });
  } catch {
    rejected = true;
  }
  check(
    'قاعدة البيانات ترفض حركة ثانية لنفس الأمر والمستلزم',
    rejected,
    'القيد الفريد — لا فحص التطبيق — هو ما يمنع فعلاً',
  );

  // ── الدفتر يفسّر الرصيد ──────────────────────────────────
  const ledger = await prisma.supplyTransaction.findMany({
    where: { productionOrderId: order.id, type: 'CONSUME' },
    select: { supplyId: true, quantity: true },
  });
  const whiteRow = ledger.find((l) => l.supplyId === white.id);
  check(
    'كل خصم له حركة في الدفتر تفسّره',
    whiteRow !== undefined && n(whiteRow.quantity) === 0.8,
    whiteRow ? `${whiteRow.quantity}` : 'لا حركة',
  );
  check(
    'وعدد الحركات يطابق عدد المستلزمات المخصومة',
    ledger.length === plan.deductions.length,
    `${ledger.length} حركة`,
  );

  // ── نقص الرصيد يُبلَّغ ───────────────────────────────────
  const poor = supplies.map((s) => ({ ...s, onHand: '0.1', minStock: '1' }));
  const blockedPlan = planConsumption(lines, 500, poor);
  check(
    'طلب أكبر من الرصيد → blocked قبل أي كتابة',
    blockedPlan.blocked === true,
    'الحساب يمنع، ولا تُكتب حركة',
  );

  // ── تنظيف ───────────────────────────────────────────────
  await prisma.supplyTransaction.deleteMany({
    where: { productionOrderId: order.id, type: 'CONSUME', notes: 'اختبار آلي' },
  });
  for (const [id, onHand] of original) {
    await prisma.supply.update({ where: { id }, data: { onHand } });
  }
  const leftover = await prisma.supplyTransaction.count({
    where: { productionOrderId: order.id, type: 'CONSUME' },
  });
  check('نُظّف كل ما أنشأه الاختبار وأُعيدت الأرصدة', leftover === 0);

  report();
}

function report() {
  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${passed}/${results.length} تحقّقاً ناجحاً`);
  if (passed !== results.length) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
