/**
 * كل لمسة لجدول مملوك لمستأجر تحمل شرط المستأجر.
 *
 * ── لماذا صار هذا الفحص ضرورياً ────────────────────────────
 *
 * كان العزل في قاعدة البيانات يمسك ما ينساه الكود: استعلام بلا شرط مستأجر
 * يعود فارغاً، وتعديلٌ على صفّ غير مملوك يُرفض. بنقل النظام إلى MySQL يزول
 * ذلك — لا سياسات صفوف هناك — فيصير شرط المستأجر في الكود هو الحاجز
 * الوحيد.
 *
 * وحاجزٌ وحيد يُقاس. النظام اليوم مستأجر واحد فلا يظهر أثر الخطأ، لكنه
 * يبقى كامناً: أول يوم يدخل فيه مستأجر ثانٍ تُقرأ بياناته من شاشة غيره.
 *
 * الكتابة أخطر من القراءة: قراءة بلا شرط تُظهر ما لا يخصّ، وكتابة بلا شرط
 * **تغيّر** ما لا يخصّ. فتُفحص العمليتان، والكتابة لا يُقبل فيها استثناء
 * «يُوصل إليه من أب».
 *
 * ── كيف يقرأ ───────────────────────────────────────────────
 *
 * الأقواس تُوازَن ولا يُقرأ سطر واحد: الشرط يقع غالباً في السطر التالي
 * للاستدعاء، وفحصٌ سطريّ يبلّغ عن أخطاء لا وجود لها — ثمانية وثلاثون
 * إنذاراً كاذباً في أول تشغيل، تكفي لدفن أي خطأ حقيقي بينها. والأسماء
 * تُتبَّع أيضاً، لأن الشرط يُبنى كثيراً في متغيّر ثم يُمرَّر باسمه.
 *
 * جداول الهوية تُقرأ عبر authDb عمداً — البحث عن المستخدم يسبق معرفة
 * مستأجره — فتُستثنى استدعاءاتها.
 *
 * لا يكتب شيئاً.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

/** النماذج التي تحمل عمود tenantId — وحدها تحتاج الشرط. */
const schema = readFileSync(join(root, 'prisma/schema.prisma'), 'utf8');
const scoped = new Set();
for (const block of schema.split(/^model\s+/m).slice(1)) {
  const name = block.match(/^(\w+)/)?.[1];
  if (/^\s{2}tenantId\s+String/m.test(block.slice(0, block.lastIndexOf('}')))) {
    // اسم النموذج كما يظهر في عميل Prisma: أول حرف صغير.
    scoped.add(name[0].toLowerCase() + name.slice(1));
  }
}

const READS = ['findMany', 'findFirst', 'findFirstOrThrow', 'count', 'aggregate', 'groupBy'];
const WRITES = ['update', 'updateMany', 'delete', 'deleteMany', 'upsert'];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

/** من فتحة القوس، نصّ الوسيط كاملاً بموازنة الأقواس. */
function argument(text, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < text.length; i++) {
    const c = text[i];
    if ('({['.includes(c)) depth++;
    else if (')}]'.includes(c)) {
      depth--;
      if (depth === 0) return text.slice(openIndex, i + 1);
    }
  }
  return text.slice(openIndex);
}

/** هل يحمل الوسيط شرط المستأجر — مباشرةً أو عبر متغيّر في نفس الملف؟ */
function resolves(arg, text, depth = 0) {
  if (/tenantId/.test(arg)) return true;
  if (depth > 1) return false;

  for (const id of new Set([...arg.matchAll(/\b([a-z]\w*)\b/g)].map((m) => m[1]))) {
    const decl = text.match(new RegExp(`\\b(?:const|let)\\s+${id}\\b[^=]*=\\s*`));
    if (!decl) continue;
    const start = decl.index + decl[0].length;
    if (!'{(['.includes(text[start])) continue;
    if (resolves(argument(text, start), text, depth + 1)) return true;
  }
  return false;
}

/**
 * هل سبق هذه الكتابةَ جلبٌ بشرط المستأجر لنفس النموذج؟
 *
 * النمط السليم السائد في الكود:
 *
 *   const invoice = await prisma.invoice.findFirst({ where: { id, tenantId } });
 *   if (!invoice) redirect('/invoices');
 *   await tx.invoice.update({ where: { id }, … });
 *
 * التعديل بالمعرّف وحده لا يعني شيئاً هنا: من لا يملك الصفّ خرج قبل أن
 * يصل. فيُبحث في الدالة المحيطة عن ذلك الجلب.
 *
 * الحدّ هو أقرب `function` قبل الكتابة — لا الملف كله، وإلا لَغطّى حارسٌ
 * في دالة أخرى كتابةً لا علاقة له بها.
 */
function guarded(text, writeIndex) {
  const starts = [...text.slice(0, writeIndex).matchAll(/^(?:export\s+)?(?:async\s+)?function\s/gm)];
  const from = starts.length ? starts[starts.length - 1].index : 0;
  const body = text.slice(from, writeIndex);

  // أي جلب بشرط المستأجر، لا جلب نفس النموذج وحده. المعرّف يأتي كثيراً من
  // كيان آخر جرى التحقّق منه: `version.formulaId` بعد جلب النسخة بشرطها،
  // أو `order.salesOrder.id` بعد جلب أمر التصنيع. اشتراط تطابق النموذج
  // يبلّغ عن كل هذه كأخطاء، وهي سليمة.
  const fetch = /\.(\w+)\.(findFirst|findUnique|findFirstOrThrow|findMany)\s*\(/g;
  for (const f of body.matchAll(fetch)) {
    if (/tenantId/.test(argument(body, f.index + f[0].length - 1))) return true;
  }
  return false;
}

/**
 * كتابات حارسها في مكان آخر، رُوجعت واحدة واحدة.
 *
 * الفحص يقرأ الدالة المحيطة وحدها. حارسٌ في دالة مساعدة أو عند من ينادي
 * لا يراه — وتوسيعه ليتتبّع الاستدعاءات يجعله يقبل ما لا يجب أن يقبله،
 * وهذه مقايضة خاسرة: فحصٌ يخطئ في المنع يُراجَع مرة، وفحصٌ يخطئ في السماح
 * لا يُراجَع أبداً.
 *
 * فالاستثناء مكتوب بسببه ويُطبع في كل تشغيل. من يغيّر أحد هذين الموضعين
 * يقرأ السبب ويحكم بنفسه، ولا يمرّ الأمر صامتاً.
 */
const REVIEWED = [
  {
    file: 'apps/web/src/app/(erp)/formulas/actions.ts',
    call: 'formula.update',
    why: 'draftVersion(user.tenantId, versionId) تجلب بشرط المستأجر وتخرج إن لم تجد',
  },
  {
    file: 'apps/web/src/lib/consume.ts',
    call: 'supply.update',
    why: 'supplyId من خطّة بُنيت على مستلزمات مرّرها المنادي مفلترة بمستأجره',
  },
];

const leaks = [];
const writes = [];
const exempt = [];
const reachable = [];
let checked = 0;

for (const file of walk(join(root, 'apps/web/src'))) {
  const text = readFileSync(file, 'utf8');
  const ops = [...READS, ...WRITES];
  const pattern = new RegExp(`(\\w+)\\.(\\w+)\\.(${ops.join('|')})\\s*\\(`, 'g');

  for (const m of text.matchAll(pattern)) {
    const [, client, model, op] = m;
    if (!scoped.has(model)) continue;
    if (/authDb/.test(client)) continue;

    checked++;
    const arg = argument(text, m.index + m[0].length - 1);
    if (resolves(arg, text)) continue;

    const at = {
      file: relative(root, file).replace(/\\/g, '/'),
      line: text.slice(0, m.index).split('\n').length,
      call: `${model}.${op}`,
    };

    if (WRITES.includes(op)) {
      // كتابة بمعرّف جاء من العميل — إلا أن يكون تُحقّق منه قبلها.
      const reviewed = REVIEWED.find((r) => r.file === at.file && r.call === at.call);
      if (reviewed) exempt.push({ ...at, why: reviewed.why });
      else if (!guarded(text, m.index)) writes.push(at);
    } else if (/\b\w+Id\s*[,:}\s]/.test(arg)) {
      // قراءة مفلترة بمفتاح كيان آخر — يُوصل إليها من أب تحقّق منه.
      // `stockMovement.findFirst({ where: { salesOrderLineId } })` لا يحمل
      // شرط مستأجر ولا يحتاجه: السطر جاء من أمر بيع جُلب بشرطه.
      //
      // تُفصل ولا تُخفى: صحّتها تعتمد على تحقّق يقع في مكان آخر، وإخفاؤها
      // يعني ألّا يراجعها أحد لو تغيّر ذلك المكان.
      reachable.push(at);
    } else {
      leaks.push(at);
    }
  }
}

console.log(`${scoped.size} نموذجاً مملوكاً لمستأجر · ${checked} لمسة مفحوصة`);
console.log(
  `${checked - leaks.length - writes.length - reachable.length} بشرط مباشر · ` +
    `${reachable.length} عبر أب متحقّق منه\n`,
);

if (reachable.length > 0) {
  console.log('── قراءات بمفتاح كيان لا بمستأجر — صحّتها في تحقّق الأب ──');
  for (const f of reachable) console.log(`  · ${f.file}:${f.line}  ${f.call}`);
  console.log('');
}

if (exempt.length > 0) {
  console.log('── كتابات حارسها في مكان آخر — روجعت ──');
  for (const f of exempt) {
    console.log(`  · ${f.file}:${f.line}  ${f.call}`);
    console.log(`      ${f.why}`);
  }
  console.log('');
}

let failed = false;

if (writes.length > 0) {
  failed = true;
  console.log(`✗ ${writes.length} كتابة بلا شرط مستأجر — تعدّل صفوف أي مستأجر:\n`);
  for (const f of writes) console.log(`  ${f.file}:${f.line}  ${f.call}`);
  console.log('');
}

if (leaks.length > 0) {
  failed = true;
  console.log(`✗ ${leaks.length} قراءة بلا شرط مستأجر — تقرأ بيانات كل المستأجرين:\n`);
  for (const f of leaks) console.log(`  ${f.file}:${f.line}  ${f.call}`);
  console.log('');
}

if (!failed) {
  console.log('✓ كل قراءة وكتابة محصورة في مستأجرها');
  console.log('  هذا هو الحاجز الذي يحلّ محلّ عزل قاعدة البيانات.');
} else {
  process.exitCode = 1;
}
