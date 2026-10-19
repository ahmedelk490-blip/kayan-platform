'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { FavoriteButton } from './FavoriteButton';
import { subscribeFavorites, getFavoritesSnapshot, NO_FAVORITES } from '@/lib/favorites';

/** منتجات المفضلة المحفوظة في هذا المتصفح — بنفس بطاقة صفحة المنتجات. */
export function FavoritesList() {
  const items = useSyncExternalStore(subscribeFavorites, getFavoritesSnapshot, () => NO_FAVORITES);

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-[640px] rounded-2xl border border-edge-strong bg-panel/70 px-6 py-8 text-center text-sm leading-[1.9] text-body-muted">
        <p>ما في منتجات بالمفضلة بعد. اضغط القلب على أي منتج حتى تحفظه هنا وترجع له بسهولة.</p>
        <Link href="/products" className="mt-4 inline-block rounded-full bg-brand-fill px-6 py-3 text-sm font-medium text-on-brand">
          تصفّح المنتجات
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((p) => (
        <div key={p.productId} className="relative">
        <Link
          href={`/products/${p.productId}`}
          aria-label={`تفاصيل ${p.productName}`}
          className="group relative block overflow-hidden rounded-2xl border border-edge-strong bg-panel/70 transition-colors duration-300 hover:border-brand/50"
        >
          <div className="relative aspect-[4/5] overflow-hidden bg-panel-2">
            {p.image ? (
              <Image src={p.image} alt={p.productName} fill sizes="(max-width: 640px) 50vw, 25vw" className="object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-body-subtle">لا توجد صورة بعد</div>
            )}
          </div>
          <p className="px-4 py-3 text-sm font-semibold text-body">{p.productName}</p>
        </Link>
        {/* القلب بجانب الرابط لا داخله — زرٌّ داخل رابط عنصرٌ تفاعليٌّ متداخل. */}
        <FavoriteButton item={p} className="absolute end-2 top-2 z-10" />
        </div>
      ))}
    </div>
  );
}
