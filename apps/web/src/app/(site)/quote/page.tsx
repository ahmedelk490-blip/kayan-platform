import type { Metadata } from 'next';
import { publicProducts, siteWhatsApp } from '@/lib/catalog';
import { QuoteForm } from '@/components/site/sections/QuoteForm';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'اطلب عرض سعر',
  description: 'اختار المنتج والعدد ونوع الشغل (طباعة أو تطريز)، ونرجع لك بتسعيرة مفصّلة — أقل طلب ٤ قطع.',
  alternates: { canonical: '/quote' },
};

/**
 * صفحة «اطلب عرض سعر» الكاملة.
 *
 * بطلب المالك: كل أزرار «اطلب عرض سعر» تفتح هذه الصفحة بالنموذج الكامل،
 * بدل القفز لقسم في الرئيسية (كان لا يعمل من الصفحات الأخرى). ‎?product=<id>
 * يختار المنتج مسبقاً حين يأتي الزائر من صفحة منتج.
 */
export default async function QuotePage({ searchParams }: { searchParams: Promise<{ product?: string }> }) {
  const [{ product }, products, whatsapp] = await Promise.all([searchParams, publicProducts(), siteWhatsApp()]);
  const list = products.map((p) => ({ id: p.id, name: p.nameAr }));
  const preselect = list.some((p) => p.id === product) ? product : undefined;

  return (
    <div className="pt-20 md:pt-24">
      <QuoteForm products={list} whatsapp={whatsapp} defaultProduct={preselect} />
    </div>
  );
}
