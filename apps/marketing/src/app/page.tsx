import { Hero } from '@/components/sections/Hero';
import { Products } from '@/components/sections/Products';
import { Services } from '@/components/sections/Services';
import { WhyKayan } from '@/components/sections/WhyKayan';
import { QuoteForm } from '@/components/sections/QuoteForm';

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
export default function HomePage() {
  return (
    <>
      <Hero />
      <Products />
      <Services />
      <WhyKayan />
      <QuoteForm />
    </>
  );
}
