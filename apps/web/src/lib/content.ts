import 'server-only';

import { prisma } from './prisma';
import { setCurrentTenant } from './tenant-context';
import { SERVICES, WHY_KAYAN } from '@/site';

/**
 * نصوص الموقع العام — من قاعدة البيانات، مع رجوع للكود.
 *
 * كانت في `site.ts`، فتغيير كلمة واحدة يحتاج نشراً كاملاً. صارت هنا ليعدّلها
 * المدير من شاشة النظام ويظهر التغيير فوراً.
 *
 * ── الرجوع للكود ليس زينة ─────────────────────────────────
 *
 * المفتاح ثابت في الكود والقيمة في قاعدة البيانات. فإذا غاب المفتاح — أو
 * كانت القاعدة غير متاحة — يُعرض النص المكتوب في الكود لا فراغ.
 *
 * هذا مقصود: نص تسويقي فارغ على صفحة رئيسية أسوأ من نص قديم. والصفحة التي
 * تفرغ لأن صفّاً واحداً ناقص هي صفحة تنتظر أن تسقط.
 */

const PUBLIC_TENANT = process.env.PUBLIC_TENANT_ID ?? 'kayan';

/**
 * القيم المكتوبة في الكود — مصدر الرجوع، ومصدر البذرة الأولى.
 *
 * تُبنى من `SERVICES` و`WHY_KAYAN` نفسها، فلا تنشأ نسخة ثالثة تتباعد عنهما.
 */
export function contentDefaults(): { key: string; valueAr: string; group: string; label: string }[] {
  const rows: { key: string; valueAr: string; group: string; label: string }[] = [];

  for (const s of SERVICES) {
    rows.push({
      key: `service.${s.id}.name`,
      valueAr: s.name,
      group: 'services',
      label: `الخدمات — عنوان «${s.name}»`,
    });
    rows.push({
      key: `service.${s.id}.body`,
      valueAr: s.body,
      group: 'services',
      label: `الخدمات — وصف «${s.name}»`,
    });
  }

  for (const w of WHY_KAYAN) {
    rows.push({
      key: `why.${w.id}.title`,
      valueAr: w.title,
      group: 'why',
      label: `ليش كيان — عنوان «${w.title}»`,
    });
    rows.push({
      key: `why.${w.id}.body`,
      valueAr: w.body,
      group: 'why',
      label: `ليش كيان — وصف «${w.title}»`,
    });
  }

  rows.push(
    {
      key: 'about.p1',
      valueAr:
        'كيان يصنع الزي الموحّد للشركات والمطاعم وفرق العمل الميداني: اليلكات والتيشيرتات والبولو والمرايل والشماغ وزي المطاعم والزي الإداري.',
      group: 'about',
      label: 'عن كيان — الفقرة الأولى',
    },
    {
      key: 'about.p2',
      valueAr:
        'الطباعة والتطريز بنفس المعمل. وهذا مو تفصيل إداري: لمّا يكون التنفيذ عدنا، الموعد اللي نعطيك إياه موعد نكدر نلتزم بيه، والتعديل على شعارك ما ينتظر دور واحد ثاني.',
      group: 'about',
      label: 'عن كيان — الفقرة الثانية',
    },
    {
      key: 'about.p3',
      valueAr:
        'الخامات ننتقيها تتحمّل الغسل المتكرر والشغل اليومي. زي يبهت لونه بعد شهر مو أرخص — هو نفس الطلب مرة ثانية.',
      group: 'about',
      label: 'عن كيان — الفقرة الثالثة',
    },
    {
      key: 'hero.tagline',
      valueAr: 'يلكات • تيشيرتات • زي الشركات والمطاعم',
      group: 'hero',
      label: 'الصفحة الرئيسية — السطر تحت العنوان',
    },
    {
      key: 'hero.sub',
      valueAr: 'خامات مضمونة | موديلات حديثة | تطريز وطباعة بمعملنا',
      group: 'hero',
      label: 'الصفحة الرئيسية — السطر الثالث',
    },
  );

  return rows;
}

export type Content = (key: string) => string;

/**
 * قارئ النصوص.
 *
 * يُرجع دالة: `t('service.printing.body')`. المفتاح المفقود يعود لقيمة
 * الكود، والمفقود من الاثنين يعود بالمفتاح نفسه — ظاهراً على الشاشة، لأن
 * مفتاحاً خاطئاً يجب أن يُرى ويُصلح لا أن يختفي كفراغ.
 */
export async function siteContent(): Promise<Content> {
  const defaults = new Map(contentDefaults().map((r) => [r.key, r.valueAr]));

  setCurrentTenant(PUBLIC_TENANT);
  let stored = new Map<string, string>();
  try {
    const rows = await prisma.siteContent.findMany({
      where: { tenantId: PUBLIC_TENANT },
      select: { key: true, valueAr: true },
    });
    stored = new Map(rows.map((r) => [r.key, r.valueAr]));
  } catch (error) {
    // القاعدة غير متاحة: تُعرض نصوص الكود. الموقع لا يفرغ.
    console.error('[content] تعذّر قراءة نصوص الموقع — تُعرض قيم الكود', error);
  }

  return (key: string) => stored.get(key) ?? defaults.get(key) ?? key;
}
