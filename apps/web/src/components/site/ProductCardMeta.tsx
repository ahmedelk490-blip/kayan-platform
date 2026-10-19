import type { PublicProduct } from '@/lib/catalog';

/**
 * سطر المعلومات تحت اسم المنتج في البطاقة: «يبدأ من» وعيّنات الألوان والمقاسات —
 * كلها من النظام، فما يغيّره المالك في المنتج يظهر هنا وحده (بطلبه).
 */
export function ProductCardMeta({ product }: { product: Pick<PublicProduct, 'priceFrom' | 'swatches' | 'sizes'> }) {
  const shown = product.swatches.slice(0, 5);
  const more = product.swatches.length - shown.length;
  const sizes =
    product.sizes.length > 1 ? `${product.sizes[0]} – ${product.sizes[product.sizes.length - 1]}` : product.sizes[0];

  return (
    <div className="mt-2 space-y-1.5 text-xs text-white/90">
      {product.priceFrom !== null && (
        <p>
          يبدأ من <strong className="tnum font-bold text-white">{product.priceFrom.toLocaleString('en-US')}</strong> د.ع
        </p>
      )}
      {(shown.length > 0 || sizes) && (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          {shown.length > 0 && (
            <span className="flex items-center gap-1" aria-label={`الألوان: ${product.swatches.map((s) => s.name).join('، ')}`}>
              {shown.map((s) => (
                <span
                  key={s.name}
                  title={s.name}
                  className="h-3.5 w-3.5 rounded-full border border-white/50"
                  style={{ background: s.hex ?? 'transparent' }}
                />
              ))}
              {more > 0 && <span className="tnum text-white/80">+{more}</span>}
            </span>
          )}
          {sizes && <span className="tnum" dir="ltr">{sizes}</span>}
        </div>
      )}
    </div>
  );
}
