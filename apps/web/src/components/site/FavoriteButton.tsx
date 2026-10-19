'use client';

import { useSyncExternalStore } from 'react';
import {
  toggleFavorite,
  subscribeFavorites,
  getFavoritesSnapshot,
  NO_FAVORITES,
  type FavoriteItem,
} from '@/lib/favorites';

/** قلب المفضلة — يضيف المنتج للمفضلة أو يرفعه منها. */
export function FavoriteButton({ item, className = '' }: { item: FavoriteItem; className?: string }) {
  const favorites = useSyncExternalStore(subscribeFavorites, getFavoritesSnapshot, () => NO_FAVORITES);
  const on = favorites.some((f) => f.productId === item.productId);

  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? `إزالة ${item.productName} من المفضلة` : `إضافة ${item.productName} للمفضلة`}
      onClick={(e) => {
        // داخل بطاقةٍ كلّها رابط: القلب لا يفتح المنتج.
        e.preventDefault();
        e.stopPropagation();
        toggleFavorite(item);
      }}
      className={`flex h-10 w-10 items-center justify-center rounded-full border border-edge-strong bg-panel/85 transition-colors hover:border-brand ${
        on ? 'text-brand' : 'text-body-muted'
      } ${className}`}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8">
        <path d="M12 20.5s-7.5-4.6-9.3-9.2C1.5 8.1 3.6 4.5 7.2 4.5c2 0 3.6 1.1 4.8 2.8 1.2-1.7 2.8-2.8 4.8-2.8 3.6 0 5.7 3.6 4.5 6.8-1.8 4.6-9.3 9.2-9.3 9.2z" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
