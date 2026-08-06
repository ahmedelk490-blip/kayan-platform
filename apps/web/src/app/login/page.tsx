import type { Metadata } from 'next';
import { BRAND } from '@erp/brand';
import { Logo } from '@erp/brand/logo';
import { redirectIfAuthenticated } from '@/lib/guard';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = {
  title: 'تسجيل الدخول',
};

/**
 * صفحة دخول واحدة لكل الأدوار.
 *
 * There is no role picker. The user proves who they are, and the system
 * decides where they land — a picker would be both a nuisance and an
 * information leak about which roles exist.
 */
export default async function LoginPage() {
  await redirectIfAuthenticated();

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <div className="w-full max-w-[400px]">
        <div className="mb-10 flex flex-col items-center text-center">
          <Logo height={64} className="rounded-xl" />
          <h1 className="mt-6 text-xl text-neutral-100">نظام كيان</h1>
          <p className="mt-2 text-xs text-neutral-500">{BRAND.tagline.ar}</p>
        </div>

        <div className="erp-card p-7">
          <LoginForm />
        </div>

        <p className="mt-6 text-center text-xs text-neutral-600">
          للدعم الفني تواصل مع مدير النظام
        </p>
      </div>
    </main>
  );
}
