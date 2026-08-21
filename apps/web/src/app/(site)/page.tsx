import { Hero, type HeroSlide } from '@/components/site/sections/Hero';
import { publicProducts } from '@/lib/catalog';
import { publicHeroSlides } from '@/lib/hero';
import { siteText } from '@/lib/content';
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
  const [products, heroSlides, t] = await Promise.all([
    publicProducts(),
    publicHeroSlides(),
    siteText(),
  ]);

  // لون خلفية الشريحة يُشتق من الترتيب لا من قاعدة البيانات: قيمة بصرية
  // بحتة لا يملكها العمل ولا معنى لتخزينها.
  const tint = (i: number) => `rgba(92, 35, 52, ${(0.04 + (i % 4) * 0.015).toFixed(3)})`;

  // شرائح رفعها المدير من النظام تسبق كل شيء: هذا معنى التحكّم. البايتات
  // تُقدَّم من مسار القاعدة (raw) فلا يعيد محسّن Next معالجتها.
  const uploaded: HeroSlide[] = heroSlides.map((s, i) => ({
    src: s.src,
    name: s.title,
    note: s.subtitle,
    tint: tint(i),
    raw: true,
  }));

  // صور الموديلات الشفافة (قصاصات بلا خلفية) — هي واجهة الهيرو. مفصولة عن
  // صور المنتجات في البطاقات: تلك صور المصنع الحقيقية، وهذه عرض راقٍ لشخص
  // يلبس المنتج. raw لأنها تُقدَّم كما هي بلا محسّن Next يعيد قصّها.
  const models: HeroSlide[] = [
    { src: '/hero/vest-turkish-1.webp', name: 'اليلك التركي', note: 'خامة تركية · تطريز وطباعة داخل المصنع', tint: tint(0), raw: true },
    { src: '/hero/vest-chinese.webp', name: 'اليلك الصيني', note: 'جيوب متعددة · شعارك مطرَّز', tint: tint(1), raw: true },
    { src: '/hero/apron.webp', name: 'المريلة', note: 'قماش متين · للمطاعم والمقاهي', tint: tint(2), raw: true },
    { src: '/hero/vest-turkish-2.webp', name: 'اليلك التركي — موديل ٢', note: 'قصّة عملية · بألوانك', tint: tint(3), raw: true },
  ];

  // شرائح رفعها المدير تسبق كل شيء، ثم صور الموديلات الثابتة. الواجهة لا
  // تفرغ يوماً.
  const slides = uploaded.length > 0 ? uploaded : models;

  return (
    <>
      {/* الكاروسيل يقسم على عدد الشرائح ويفهرس به: صفر يعني NaN ومؤشراً
          خارج النطاق، أي انهيار الصفحة كلها. فلا يُركَّب بلا شرائح. */}
      {slides.length > 0 && <Hero slides={slides} />}
      <Products products={products} />
      <Services t={t} />
      <WhyKayan t={t} />
      <QuoteForm />
    </>
  );
}
