import { Hero } from '@/components/site/sections/Hero';
import { publicProducts } from '@/lib/catalog';
import { Products } from '@/components/site/sections/Products';
import { Services } from '@/components/site/sections/Services';
import { WhyKayan } from '@/components/site/sections/WhyKayan';
import { QuoteForm } from '@/components/site/sections/QuoteForm';

/**
 * الصفحة الرئيسية لمصنع كيان.
 *
 * خمسة أقسام، ولكل قسم قاعدة حركة تختلف عن الذي قبله — حتى لا تُقرأ الصفحة
 * كشريط واحد طويل يتكرر:
 *   Hero      — صور منتجات حقيقية تدخل متتابعة
 *   المنتجات   — شبكة بطاقات، والصورة تكبر عند المرور
 *   الخدمات    — ألواح تدخل من جهة البداية
 *   ليش كيان   — خطوط تُرسم أفقياً سطراً بعد سطر
 *   عرض السعر  — أهدأ لحظة في الصفحة، عن قصد
 *
 * لا ذكر لنظام ERP هنا. هذه صفحة مصنع تبيع زياً موحداً وطباعة وتطريز.
 */
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const products = await publicProducts();

  return (
    <>
      <Hero />
      <Products products={products} />
      <Services />
      <WhyKayan />
      <QuoteForm />
    </>
  );
}
