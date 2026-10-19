import type { PublicProduct } from '@/lib/catalog';

/**
 * سطر المعلومات تحت اسم المنتج في البطاقة: «يبدأ من» فقط — من النظام.
 *
 * بطلب المالك: الألوان والمقاسات لا تظهر على البطاقة من الخارج؛ مكانها صفحة
 * المنتج نفسها.
 */
export function ProductCardMeta({ product }: { product: Pick<PublicProduct, 'priceFrom'> }) {
  if (product.priceFrom === null) return null;
  return (
    <p className="mt-2 text-xs text-white/90">
      يبدأ من <strong className="tnum font-bold text-white">{product.priceFrom.toLocaleString('en-US')}</strong> د.ع
    </p>
  );
}
