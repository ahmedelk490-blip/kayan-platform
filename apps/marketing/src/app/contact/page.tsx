import type { Metadata } from 'next';
import { SectionShell } from '@erp/ui-market';
import { PageHero } from '@/components/PageHero';
import { LeadForm } from '@/components/LeadForm';

export const metadata: Metadata = {
  title: 'اطلب عرض سعر',
  description:
    'أرسل تفاصيل طلبك من الزي الموحد أو الطباعة والتطريز، ونرجع لك بعرض سعر واضح وموعد تسليم محدد.',
  alternates: { canonical: '/contact' },
};

const STEPS = [
  {
    n: '٠١',
    title: 'ترسل لنا التفاصيل',
    body: 'نوع الزي، عدد القطع، وشعارك إن وُجد. كلما زادت التفاصيل كان العرض أدق.',
  },
  {
    n: '٠٢',
    title: 'نرجع لك بعرض سعر',
    body: 'خلال يوم عمل واحد، بسعر واضح للقطعة وموعد تسليم محدد — لا تقديرات مفتوحة.',
  },
  {
    n: '٠٣',
    title: 'نجهّز عينة قبل الإنتاج',
    body: 'تعتمد العينة أولاً، ثم نشغّل الكمية. لا مفاجآت في التسليم النهائي.',
  },
];

export default function ContactPage() {
  return (
    <>
      <PageHero
        eyebrow="اطلب عرض سعر"
        title="احكِ لنا عن طلبك."
        lead="عدد القطع، نوع الزي، وشعارك — ونرجع لك بعرض سعر واضح ومواعيد تسليم محددة."
      />

      <SectionShell size="tall">
        <div className="mx-auto w-full max-w-[1400px]">
          <div className="grid gap-14 lg:grid-cols-[1.15fr_0.85fr] lg:gap-20">
            <div className="rounded-2xl border border-ink-800 bg-ink-900/40 p-7 md:p-10">
              <LeadForm />
            </div>

            <div>
              <h2 className="text-xs tracking-[0.14em] text-neutral-500">كيف نعمل</h2>
              <ol className="mt-8 space-y-9">
                {STEPS.map((step) => (
                  <li key={step.n} className="flex gap-5">
                    <span className="font-display text-2xl leading-none text-primary-700">
                      {step.n}
                    </span>
                    <div>
                      <h3 className="font-display text-base text-neutral-100">{step.title}</h3>
                      <p className="mt-2 max-w-[38ch] text-sm leading-loose text-neutral-400">
                        {step.body}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>

              <div className="rule-hairline my-10" />

              <p className="max-w-[40ch] text-sm leading-loose text-neutral-500">
                نصنّع للمطاعم والشركات والمصانع والمنشآت الطبية، بكميات تبدأ من الطلبات الصغيرة
                وحتى آلاف القطع.
              </p>
            </div>
          </div>
        </div>
      </SectionShell>
    </>
  );
}
