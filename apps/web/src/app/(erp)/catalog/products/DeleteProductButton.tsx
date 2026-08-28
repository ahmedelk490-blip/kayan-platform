'use client';

import { deleteProduct } from './actions';

/**
 * زر حذف منتج من القائمة — بتأكيد قبل الحذف حتى لا يُحذف بالخطأ. الحذف ناعم
 * (يمكن استرجاعه من القاعدة)، ويخفي المنتج من النظام والموقع فوراً.
 */
export function DeleteProductButton({ id, name }: { id: string; name: string }) {
  return (
    <form
      action={deleteProduct.bind(null, id)}
      onSubmit={(e) => {
        if (!confirm(`حذف المنتج «${name}»؟ سيختفي من النظام والموقع.`)) e.preventDefault();
      }}
    >
      <button type="submit" className="text-xs text-bad hover:underline">حذف</button>
    </form>
  );
}
