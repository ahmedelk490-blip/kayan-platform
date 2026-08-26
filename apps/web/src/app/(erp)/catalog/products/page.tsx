import type { Metadata } from 'next';
import type { SearchParams } from '@/lib/query';
import { ProductsArea } from './ProductsArea';

export const metadata: Metadata = { title: 'المنتجات' };

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return <ProductsArea searchParams={searchParams} basePath="/catalog/products" />;
}
