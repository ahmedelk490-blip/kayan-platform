import type { Metadata } from 'next';
import Link from 'next/link';
import { SectionShell } from '@erp/ui-market';
import { PageHero } from '@/components/site/PageHero';
import { SERVICES, WHY_KAYAN } from '@/site';

export const metadata: Metadata = {
  title: 'الطباعة والتطريز',
  description:
    'طباعة DTF وطباعة الرول والتطريز داخل مصنع كيان — على اليلكات والتيشيرتات والمرايل والقبعات.',
  alternates: { canonical: '/services' },
};

/**
 * صفحة الخدمات.
 *
 * محتواها من `SERVICES` و`WHY_KAYAN` — نفس المصدر الذي تعرضه الصفحة
 * الرئيسية، فلا تنشأ نسختان تتباعدان مع الوقت.
 *
 * لا أرقام أداء ولا نسب هنا. الادّعاءات المقيسة تحتاج قياساً، وما لم
 * يُقَس لا يُكتب.
 */
export default function ServicesPage() {
  return (
    <>
      <PageHero
        eyebrow="الطباعة والتطريز"
        title="التنفيذ داخل المصنع."
        lead="الطباعة والتطريز يتمّان عندنا لا عند طرف ثالث — وهذا ما يجعل الموعد الذي نعطيه موعداً نملك الوفاء به."
      />

      <SectionShell size="tall">
        <div className="grid gap-6 md:grid-cols-3">
          {SERVICES.map((s) => (
            <article
              key={s.id}
              className="rounded-2xl border border-edge-strong bg-panel/70 p-6"
            >
              <h2 className="text-base font-medium text-body">{s.name}</h2>
              <p className="mt-3 text-sm leading-[1.9] text-body-muted">{s.body}</p>
              {'points' in s && Array.isArray(s.points) && (
                <ul className="mt-4 space-y-2">
                  {s.points.map((p: string) => (
                    <li key={p} className="flex gap-2 text-[0.8rem] text-body-muted">
                      <span aria-hidden className="text-brand">
                        ·
                      </span>
                      {p}
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </div>
      </SectionShell>

      <SectionShell>
        <h2 className="mb-8 text-2xl text-body">ليش كيان</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          {WHY_KAYAN.map((w) => (
            <div key={w.title} className="rounded-2xl border border-edge bg-panel/50 p-5">
              <h3 className="text-sm font-medium text-body">{w.title}</h3>
              <p className="mt-2 text-sm leading-[1.9] text-body-muted">{w.body}</p>
            </div>
          ))}
        </div>

        <p className="mt-10 text-sm text-body-muted">
          عندك طلب محدّد؟{' '}
          <Link href="/contact" className="text-brand hover:underline">
            اطلب عرض سعر
          </Link>
          {' '}وسنرجع لك بسعر وموعد تسليم واضحين.
        </p>
      </SectionShell>
    </>
  );
}
