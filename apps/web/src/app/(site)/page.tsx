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

  // الشرائح من نفس المنتجات: ما له صورة فقط. التدرّج اللوني يُشتق من
  // الترتيب — قيمة بصرية لا يملكها العمل ولا تُخزَّن.
  const slides = products
    .filter((p) => p.image)
    .slice(0, 6)
    .map((p, i) => ({
      src: p.image as string,
      name: p.nameAr,
      note: p.materials.join(' · ') || p.descriptionAr?.slice(0, 40) || p.sku,
      tint: `rgba(92, 35, 52, ${(0.04 + (i % 4) * 0.015).toFixed(3)})`,
    }));

  return (
    <>
      <Hero slides={slides} />
      <Products products={products} />
      <Services />
      <WhyKayan />
      <QuoteForm />
    </>
  );
}
