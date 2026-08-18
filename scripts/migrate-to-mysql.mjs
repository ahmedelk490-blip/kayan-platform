/**
 * نقل كل صفّ من PostgreSQL إلى MySQL.
 *
 *   node --env-file=.env scripts/migrate-to-mysql.mjs
 *
 * القراءة بعميل Prisma مولَّد على PostgreSQL، والكتابة بعميل MySQL. كلاهما
 * يمرّ بنفس التحويلات التي يمرّ بها التطبيق طوال عمره — التواريخ إلى
 * DATETIME، والأرقام إلى DECIMAL(19,4). كتابة SQL خام على الطرفين تختبر
 * مساراً لا يسلكه التطبيق أبداً.
 *
 * ── الترتيب يُحسب ولا يُكتب ────────────────────────────────
 *
 * الآباء قبل الأبناء، وإلا رفض المفتاح الأجنبي. وقائمة مكتوبة بخطّ اليد
 * تشيخ: نموذج جديد يُضاف إلى المخطّط ولا يُضاف إليها، فينقل النظام ناقصاً
 * ولا يشتكي أحد. فيُقرأ الترتيب من علاقات المخطّط نفسه.
 *
 * الحلقات في الرسم البياني حقيقية — Formula تشير إلى FormulaVersion وهي
 * تشير إليها — فتُكسر بتأجيل العمود الراجع إلى تمريرة ثانية.
 *
 * ── ماذا يُنقل ─────────────────────────────────────────────
 *
 * كل شيء إلا الجلسات: رمز الجلسة يعيش في كوكي المتصفّح ولا تُخزَّن منه إلا
 * بصمته، ونقلها يعني إبقاء أحد داخلاً على قاعدة جديدة بلا سبب. يسجّل
 * الجميع دخولهم مرة واحدة.
 *
 * يقارن العدد بعد النقل جدولاً جدولاً، ويفشل عند أول اختلاف. نقلٌ ينتهي
 * بصمت وينقص صفّاً في جدول الفواتير أسوأ من نقل يتوقّف.
 *
 * آمن لإعادة التشغيل: الصفوف الموجودة تُتخطّى، فالتشغيل الجزئي يُستأنف.
 */
import { createRequire } from 'node:module';
import { PrismaClient as MySqlClient, Prisma } from '@prisma/client';

const require = createRequire(import.meta.url);
const { PrismaClient: PgClient } = require('../node_modules/.prisma/pg-export');

const pgUrl = process.env.MAINTENANCE_DATABASE_URL;
const myUrl = process.env.MYSQL_DATABASE_URL ?? process.env.DATABASE_URL;
if (!pgUrl || !myUrl) {
  console.error('يلزم MAINTENANCE_DATABASE_URL (المصدر) وMYSQL_DATABASE_URL أو DATABASE_URL (الوجهة)');
  process.exit(1);
}

const pg = new PgClient({ datasources: { db: { url: pgUrl } }, log: ['error'] });
const my = new MySqlClient({ datasources: { db: { url: myUrl } }, log: ['error'] });

/** الجلسات لا تُنقل — انظر الترويسة. */
const SKIP = new Set(['Session']);

/** أعمدة تشير إلى صفّ يأتي لاحقاً؛ تُفرَّغ ثم تُملأ في تمريرة ثانية. */
const DEFERRED = { Formula: ['currentVersionId'] };

const delegate = (model) => model.charAt(0).toLowerCase() + model.slice(1);
const models = Prisma.dmmf.datamodel.models.filter((m) => !SKIP.has(m.name));

/**
 * ترتيب طوبولوجي على المفاتيح الأجنبية.
 *
 * الأعمدة المؤجَّلة تُحذف من حساب التبعية، وإلا استحالت الحلقة على الترتيب
 * ولم يُنقل أيّ من طرفيها.
 */
function order() {
  const byName = new Map(models.map((m) => [m.name, m]));
  const deps = new Map();

  for (const m of models) {
    const set = new Set();
    for (const f of m.fields) {
      if (f.kind !== 'object' || !f.relationFromFields?.length) continue;
      if (DEFERRED[m.name]?.some((c) => f.relationFromFields.includes(c))) continue;
      if (f.type !== m.name && byName.has(f.type)) set.add(f.type);
    }
    deps.set(m.name, set);
  }

  const sorted = [];
  const done = new Set();
  while (sorted.length < models.length) {
    const ready = models.filter(
      (m) => !done.has(m.name) && [...deps.get(m.name)].every((d) => done.has(d)),
    );
    if (ready.length === 0) {
      const stuck = models.filter((m) => !done.has(m.name)).map((m) => m.name);
      throw new Error(`حلقة في العلاقات لم تُكسر: ${stuck.join(', ')}`);
    }
    for (const m of ready) {
      sorted.push(m.name);
      done.add(m.name);
    }
  }
  return sorted;
}

/** الحقول القياسية فقط — العلاقات محمولة في مفاتيحها. */
function scalars(model) {
  return models
    .find((m) => m.name === model)
    .fields.filter((f) => f.kind !== 'object')
    .map((f) => f.name);
}

async function main() {
  const sequence = order();
  console.log(`${sequence.length} نموذجاً · الترتيب محسوب من العلاقات\n`);

  const moved = new Map();
  const deferredRows = [];

  for (const model of sequence) {
    const cols = scalars(model);
    const rows = await pg[delegate(model)].findMany();
    if (rows.length === 0) {
      moved.set(model, 0);
      continue;
    }

    const drop = DEFERRED[model] ?? [];
    let written = 0;

    for (const row of rows) {
      const data = {};
      for (const c of cols) {
        if (drop.includes(c)) continue;
        data[c] = row[c];
      }
      try {
        await my[delegate(model)].create({ data });
        written++;
      } catch (e) {
        // موجود سلفاً — تشغيل جزئي سابق. غير ذلك يُرفع.
        if (e.code !== 'P2002') throw new Error(`${model} · ${row.id ?? ''} · ${e.message.split('\n')[0]}`);
      }
      if (drop.length > 0 && drop.some((c) => row[c] != null)) {
        deferredRows.push({ model, id: row.id, values: Object.fromEntries(drop.map((c) => [c, row[c]])) });
      }
    }

    moved.set(model, written);
    console.log(`  ${model.padEnd(28)} ${String(written).padStart(5)} صفّاً`);
  }

  if (deferredRows.length > 0) {
    console.log(`\nالتمريرة الثانية — ${deferredRows.length} مرجعاً مؤجَّلاً`);
    for (const d of deferredRows) {
      await my[delegate(d.model)].update({ where: { id: d.id }, data: d.values });
    }
  }

  // ── المقارنة: عدد المصدر = عدد الوجهة، جدولاً جدولاً ─────
  console.log('\n── المقارنة ──');
  let mismatched = 0;
  for (const model of sequence) {
    const [src, dst] = await Promise.all([
      pg[delegate(model)].count(),
      my[delegate(model)].count(),
    ]);
    if (src !== dst) {
      mismatched++;
      console.log(`  ✗ ${model.padEnd(28)} المصدر ${src} · الوجهة ${dst}`);
    }
  }

  const total = [...moved.values()].reduce((a, b) => a + b, 0);
  if (mismatched === 0) console.log(`  ✓ كل الجداول متطابقة — ${total} صفّاً`);
  else {
    console.log(`\n✗ ${mismatched} جدولاً مختلفاً`);
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error('\n✗', e.message);
    process.exit(1);
  })
  .finally(async () => {
    await pg.$disconnect();
    await my.$disconnect();
  });
