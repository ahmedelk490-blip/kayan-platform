import type { Metadata } from 'next';
import Link from 'next/link';
import { SectionShell } from '@erp/ui-market';
import { PageHero } from '@/components/PageHero';

export const metadata: Metadata = {
  title: 'دخول النظام',
  description: 'الدخول إلى نظام كيان الداخلي.',
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

/** عنوان تطبيق الـ ERP. في الإنتاج يأتي من المتغيّرات البيئية. */
const ERP_URL = process.env.NEXT_PUBLIC_ERP_URL ?? 'http://localhost:3300/login';

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

            <Link
              href={ERP_URL}
              className="mt-7 inline-flex items-center rounded-full bg-accent px-8 py-4 text-sm font-medium text-ink-950 transition-opacity hover:opacity-90"
            >
              انتقل إلى شاشة الدخول
            </Link>

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
