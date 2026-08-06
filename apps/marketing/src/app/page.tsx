import { Hero } from '@/components/sections/Hero';
import { About } from '@/components/sections/About';
import { Products } from '@/components/sections/Products';
import { Services } from '@/components/sections/Services';
import { WhyKayan } from '@/components/sections/WhyKayan';
import { Vision } from '@/components/sections/Vision';
import { ContactCta } from '@/components/sections/ContactCta';

/**
 * الصفحة الرئيسية لمصنع كيان.
 *
 * سبعة أقسام، ولكل قسم قواعد حركة مختلفة عن الذي قبله:
 *   Hero      — تجميع نسيج ثلاثي الأبعاد مع حركة تلقائية
 *   من نحن     — كشف هادئ متدرّج
 *   المنتجات   — شبكة بطاقات متتابعة
 *   الخدمات    — ألواح تدخل من الجانب
 *   لماذا كيان — خطوط تُرسم أفقياً
 *   الرؤية     — ألواح تكبر من ٠٫٩٦
 *   التواصل    — أهدأ لحظة، عن قصد
 */
export default function HomePage() {
  return (
    <>
      <Hero />
      <About />
      <Products />
      <Services />
      <WhyKayan />
      <Vision />
      <ContactCta />
    </>
  );
}
