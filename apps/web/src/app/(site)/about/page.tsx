import type { Metadata } from 'next';
import Link from 'next/link';
import { BRAND } from '@erp/brand';
import { SectionShell } from '@erp/ui-market';
import { PageHero } from '@/components/site/PageHero';
import { WHY_KAYAN, PRODUCTS_WITHOUT_PHOTOS } from '@/site';

export const metadata: Metadata = {
  title: 'عن كيان',
  description:
    'مصنع كيان للزي الموحد — يلكات وتيشيرتات ومرايل وشماغ وزي المطاعم والشركات، مع طباعة وتطريز داخل المصنع.',
  alternates: { canonical: '/about' },
};

/**
 * صفحة "عن كيان".
 *
 * ⚠ لا أرقام هنا: لا سنة تأسيس، ولا عدد موظفين، ولا طاقة إنتاجية، ولا
 * أسماء عملاء. لم تُزوَّد أيٌّ منها، واختراعها على صفحة تعريفية أسوأ من
 * غيابها — العميل الذي يكتشف رقماً مبالغاً يفقد الثقة في كل ما عداه.
 *
 * ما هنا مقتصر على ما يقوله العمل عن نفسه فعلاً: ما يصنعه، وكيف ينفّذه.
 */
export default function AboutPage() {
  return (
    <>
      <PageHero
        eyebrow="عن كيان"
        title="مصنع زي موحّد، لا وسيط."
        lead="نخيط ونطبع ونطرّز داخل المصنع. تتعامل مع الجهة التي تنفّذ طلبك فعلاً، لا مع من يمرّره لغيره."
      />

      <SectionShell size="tall">
        <div className="mx-auto max-w-[760px] space-y-6 text-[0.95rem] leading-[2] text-body-muted">
          <p>
            <span className="text-body">{BRAND.nameAr}</span> يصنع الزي الموحّد
            للشركات والمطاعم وفرق العمل الميداني: اليلكات والتيشيرتات والبولو
            والمرايل والشماغ وزي المطاعم والزي الإداري.
          </p>
          <p>
            الطباعة والتطريز يتمّان في المصنع نفسه. هذا ليس تفصيلاً تنظيمياً:
            حين يكون التنفيذ عندنا، الموعد الذي نعطيه موعد نملك الوفاء به،
            والتعديل على شعارك لا ينتظر دور طرف ثالث.
          </p>
          <p>
            الخامات تُختار لتتحمّل الغسيل المتكرر والشغل اليومي. زيّ يبهت لونه
            بعد شهر ليس أرخص — هو نفس الطلب مرة ثانية.
          </p>
        </div>
      </SectionShell>

      <SectionShell>
        <h2 className="mb-8 text-2xl text-body">كيف نشتغل</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          {WHY_KAYAN.map((w) => (
            <div key={w.title} className="rounded-2xl border border-edge bg-panel/50 p-5">
              <h3 className="text-sm font-medium text-body">{w.title}</h3>
              <p className="mt-2 text-sm leading-[1.9] text-body-muted">{w.body}</p>
            </div>
          ))}
        </div>
      </SectionShell>

      <SectionShell>
        <div className="rounded-2xl border border-edge-strong bg-panel/70 p-6 md:p-8">
          <h2 className="text-lg text-body">نصنعه ولم نصوّره بعد</h2>
          <p className="mt-3 text-sm leading-[1.9] text-body-muted">
            {/* يُعرض بصراحة بدل بطاقات بصور مستعارة. */}
            <span className="text-body">{PRODUCTS_WITHOUT_PHOTOS.join(' · ')}</span> — نصنعها
            فعلاً، ولا توجد صور لها على الموقع بعد. اطلبها وسنرسل لك نماذج مصوّرة
            من إنتاجنا.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/products" className="text-sm text-brand hover:underline">
              تصفّح المنتجات
            </Link>
            <span aria-hidden className="text-body-subtle">
              ·
            </span>
            <Link href="/contact" className="text-sm text-brand hover:underline">
              اطلب عرض سعر
            </Link>
          </div>
        </div>
      </SectionShell>
    </>
  );
}
