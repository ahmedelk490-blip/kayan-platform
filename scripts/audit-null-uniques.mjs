/**
 * جرد القيود الفريدة التي تلمس عموداً اختيارياً.
 *
 * ── لماذا هذا الجرد قبل أي ترحيل ───────────────────────────
 *
 * القيد الفريد لا يمنع التكرار إذا كان أحد أعمدته فارغاً: كلا المحرّكين
 * يعتبران NULL مميّزاً عن NULL، فيمرّ صفّان متطابقان تماماً. هذا هو الشكل
 * الشائع لشريحة السعر — سعر للمنتج كله لا لمتغيّر بعينه، فـ variantId فارغ
 * في الاثنين — ونتيجته سعران لنفس الكمية، أي سعر يظهر بالحظّ.
 *
 * حُلّت المشكلة في PostgreSQL بـ NULLS NOT DISTINCT، وليس لها مقابل في
 * MySQL. فقبل نقل أي جدول يجب معرفة أيّ القيود يعتمد على ذلك السلوك.
 *
 * الجرد يقرأ المخطّط ويقابله بالهجرات: كل قيد فريد فيه عمود اختياري يُعرض،
 * ويُعلَّم أيّها عولج فعلاً. ما عولج يحتاج بديلاً في MySQL؛ وما لم يُعالج
 * يتصرّف في المحرّكين تصرّفاً واحداً فلا يتغيّر شيء بنقله.
 *
 * لا يكتب شيئاً — يقرأ ويُبلّغ.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath لا .pathname — المسار فيه مسافة، و.pathname يُبقيها %20.
const root = fileURLToPath(new URL('..', import.meta.url));
const schema = readFileSync(join(root, 'prisma/schema.prisma'), 'utf8');

/** كل هجرة، نصّاً واحداً — للبحث عن المعالجات الخاصة. */
const migrationsDir = join(root, 'prisma/migrations');
const migrations = readdirSync(migrationsDir)
  .filter((d) => /^\d/.test(d))
  .map((d) => {
    try {
      return { name: d, sql: readFileSync(join(migrationsDir, d, 'migration.sql'), 'utf8') };
    } catch {
      return { name: d, sql: '' };
    }
  });

/** النماذج، كل واحد بحقوله وقيوده. */
const models = [];
for (const block of schema.split(/^model\s+/m).slice(1)) {
  const name = block.match(/^(\w+)/)?.[1];
  const body = block.slice(block.indexOf('{') + 1, block.lastIndexOf('}'));

  const optional = new Set();
  for (const line of body.split('\n')) {
    // حقل: اسم ثم نوع. علامة الاستفهام تعني اختيارياً.
    const m = line.match(/^\s{2}(\w+)\s+(\w+)(\?)?/);
    if (m && m[3]) optional.add(m[1]);
  }

  const uniques = [];
  for (const m of body.matchAll(/@@unique\(\[([^\]]+)\]/g)) {
    uniques.push(m[1].split(',').map((f) => f.trim()));
  }
  // الحقول المعلَّمة @unique مفردة لا تدخل: عمود واحد اختياري فريد يقبل
  // فراغات متعددة في المحرّكين معاً، وهو سلوك مقصود لا فخّ.
  models.push({ name, optional, uniques });
}

const risky = [];
for (const { name, optional, uniques } of models) {
  for (const fields of uniques) {
    const nullable = fields.filter((f) => optional.has(f));
    if (nullable.length === 0) continue;

    // هل عولج في هجرة؟ المؤشّر: ذكر NULLS NOT DISTINCT مع اسم الجدول.
    const treated = migrations.find(
      (m) => /NULLS NOT DISTINCT/i.test(m.sql) && new RegExp(`"${name}"`).test(m.sql),
    );
    risky.push({ model: name, fields, nullable, treated: treated?.name ?? null });
  }
}

console.log(`${models.length} نموذجاً · ${models.reduce((n, m) => n + m.uniques.length, 0)} قيداً مركّباً\n`);

const treated = risky.filter((r) => r.treated);
const untreated = risky.filter((r) => !r.treated);

console.log(`── يعتمد على NULLS NOT DISTINCT — يحتاج بديلاً في MySQL (${treated.length}) ──`);
if (treated.length === 0) console.log('  لا شيء');
for (const r of treated) {
  console.log(`  ⚠ ${r.model}(${r.fields.join(', ')})`);
  console.log(`     الاختياري: ${r.nullable.join(', ')}  ·  عولج في ${r.treated}`);
}

console.log(`\n── فيه عمود اختياري ولم يُعالَج — سلوكه واحد في المحرّكين (${untreated.length}) ──`);
for (const r of untreated) {
  console.log(`  · ${r.model}(${r.fields.join(', ')})  ← ${r.nullable.join(', ')}`);
}
if (untreated.length === 0) console.log('  لا شيء');

console.log(
  `\nالخلاصة: ${treated.length} قيداً يحتاج عملاً في الترحيل، و${untreated.length} ينتقل كما هو.`,
);
