import type { Metadata } from 'next';
import type { SearchParams } from '@/lib/query';
import { ProductsArea } from '../../catalog/products/ProductsArea';

export const metadata: Metadata = { title: 'المنتجات — المخزن' };

/**
 * تبويب المنتجات داخل مجموعة المخزون — نفس إدارة المنتجات (إنشاء/تعديل مع نظام
 * الدست)، لكن بمساره الخاص كي يظهر كتبويب مستقل تحت المخزن بلا اختطاف تبويبات
 * مجموعة «المنتجات». إدخال المنتجات والمخزون في مكان واحد بطلب المالك.
 */
export default async function InventoryProductsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return <ProductsArea searchParams={searchParams} basePath="/inventory/products" />;
}
