import type { Metadata } from 'next';
import Link from 'next/link';
import { SectionShell } from '@erp/ui-market';
import { PageHero } from '@/components/PageHero';

export const metadata: Metadata = {
  title: 'دخول النظام',
  description: 'الدخول إلى نظام كيان الداخلي.',
  // Excluded from the sitemap and disallowed in robots.txt for the same
  // reason: a staff redirect has no search value, and the internal system
  // is not something to advertise. noindex is the part that actually binds.
  robots: { index: false, follow: false },
  // Without this the page inherits the layout's canonical and declares the
  // HOMEPAGE as its canonical URL. Harmless while noindex holds, and a real
  // defect the moment anyone lifts it.
  alternates: { canonical: '/login' },
};

/**
 * صفحة تحويل إلى نظام كيان.
 *
 * كانت هذه الصفحة تقول إنه «لا يوجد نظام مصادقة في المشروع». هذا لم يعد
 * صحيحاً منذ المرحلة الثانية: النظام يعمل بمصادقة Argon2id وجلسات مخزَّنة
 * وعزل بيانات على مستوى قاعدة البيانات. الصفحة صارت تحوّل إلى الشاشة
 * الحقيقية بدل أن تصف نظاماً غير موجود.
 *
 * ⚠ لا تُعرض كلمة مرور هنا ولا في أي مكان. حساب التجربة يُذكر بالبريد فقط،
 * وكلمته تُسلَّم لمن يحتاجها خارج الموقع.
 */

/**
 * عنوان تطبيق الـ ERP.
 *
 * No fallback on purpose. The ERP needs PostgreSQL, which the marketing
 * host does not provide, so the two will not necessarily go live together —
 * and a public button pointing at a host that does not answer is worse than
 * no button. When the variable is unset the page says the system is being
 * prepared instead of offering a link that fails.
 */
const ERP_URL = process.env.NEXT_PUBLIC_ERP_URL;

export default function LoginPage() {
  return (
    <>
      <PageHero
        eyebrow="دخول النظام"
        title="نظام كيان الداخلي."
        lead="النظام مخصص لفريق المصنع. الدخول بحساب المستخدم الذي يزوّدك به مدير النظام."
      />

      <SectionShell size="tall">
        <div className="mx-auto w-full max-w-[720px]">
          <div className="rounded-2xl border border-ink-700 bg-ink-900/60 p-8 md:p-10">
            <h2 className="text-xl text-neutral-100">تسجيل الدخول</h2>
            <p className="mt-3 text-sm leading-[1.9] text-neutral-400">
              شاشة الدخول داخل التطبيق نفسه. الصلاحيات تتحدد من دور المستخدم،
              وكل شخص يصل لبيانات منشأته فقط.
            </p>

            {ERP_URL ? (
              <a
                href={ERP_URL}
                className="mt-7 inline-flex items-center rounded-full bg-accent px-8 py-4 text-sm font-medium text-ink-950 transition-opacity hover:opacity-90"
              >
                انتقل إلى شاشة الدخول
              </a>
            ) : (
              <p className="mt-7 rounded-xl border border-ink-700 bg-ink-950/50 px-6 py-5 text-sm leading-[1.9] text-neutral-400">
                النظام قيد التجهيز على الخادم. سيظهر زر الدخول هنا فور ربطه —
                ولن يُعرض رابط قبل أن يعمل فعلاً.
              </p>
            )}

            <p className="mt-8 border-t border-ink-700 pt-6 text-xs leading-[1.9] text-neutral-500">
              حساب تجريبي: <span className="text-neutral-300" dir="ltr">manager@kayan.eg</span>
              {' '}— كلمة المرور تُطلب من مدير النظام ولا تُنشر هنا.
            </p>
          </div>

          <p className="mt-8 text-center text-xs text-neutral-500">
            لست من فريق المصنع؟{' '}
            <Link href="/#quote" className="text-accent hover:underline">
              اطلب عرض سعر بدلاً من ذلك
            </Link>
          </p>
        </div>
      </SectionShell>
    </>
  );
}
