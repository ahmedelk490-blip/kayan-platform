import type { Metadata } from 'next';
import Link from 'next/link';
import { SectionShell } from '@erp/ui-market';
import { PageHero } from '@/components/PageHero';

export const metadata: Metadata = {
  title: 'دخول النظام',
  description: 'بوابات الدخول إلى نظام كيان.',
};

/**
 * صفحة اختيار البوابة.
 *
 * ⚠ NOT the login system. This page exists solely so the homepage's
 * "دخول النظام" CTA does not 404. No authentication is implemented anywhere
 * in this project — see docs/12_Implementation_Map.md §5.
 *
 * Each portal states honestly that it is not ready rather than showing a
 * credential form that would accept input and do nothing.
 */

const PORTALS = [
  { id: 'customer', name: 'بوابة العملاء', body: 'متابعة الطلبات، اعتماد التصاميم، وسجل الفواتير.' },
  { id: 'employee', name: 'بوابة الموظفين', body: 'متابعة خطوط الإنتاج وتسجيل الكميات المنتجة.' },
  { id: 'erp', name: 'نظام ERP', body: 'المخزون والتصنيع والمبيعات والحسابات.' },
  { id: 'admin', name: 'لوحة الإدارة', body: 'المستخدمون والصلاحيات وإعدادات النظام.' },
];

export default function LoginPage() {
  return (
    <>
      <PageHero
        eyebrow="دخول النظام"
        title="بوابات كيان."
        lead="نظام كيان الداخلي قيد التطوير حالياً. هذه الصفحة توضح البوابات المخطط لها وحالتها الفعلية."
      />

      <SectionShell size="tall">
        <div className="mx-auto w-full max-w-[1400px]">
          <ul className="grid gap-5 sm:grid-cols-2">
            {PORTALS.map((portal) => (
              <li
                key={portal.id}
                className="rounded-2xl border border-ink-800 bg-ink-900/40 p-8 opacity-70"
              >
                <div className="flex items-start justify-between gap-4">
                  <h2 className="font-display text-xl text-neutral-100">{portal.name}</h2>
                  <span className="shrink-0 rounded-full border border-ink-700 px-3 py-1 text-[0.7rem] text-neutral-500">
                    قريباً
                  </span>
                </div>
                <p className="mt-3 text-sm leading-loose text-neutral-400">{portal.body}</p>
              </li>
            ))}
          </ul>

          <p className="mt-10 max-w-[60ch] text-sm leading-loose text-neutral-500">
            لا يوجد تسجيل دخول فعّال حتى الآن — لم يُبنَ بعد. لطلب عرض سعر أو للتواصل مع فريق
            كيان،{' '}
            <Link href="/contact" className="text-accent underline underline-offset-4">
              أرسل لنا طلبك من هنا
            </Link>
            .
          </p>
        </div>
      </SectionShell>
    </>
  );
}
