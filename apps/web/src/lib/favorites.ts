'use client';

import { track } from './meta-pixel';

/**
 * المفضلة — قائمة منتجات يحفظها الزائر في متصفحه (localStorage) بلا حساب،
 * كالسلّة تماماً، ليرجع إليها من صفحة «المفضلة».
 */

const KEY = 'kayan-favorites';
const EVENT = 'kayan-favorites-changed';

export interface FavoriteItem {
  productId: string;
  productName: string;
  image?: string | null;
}

function read(): FavoriteItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(items: FavoriteItem[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* حصة التخزين ممتلئة أو الوضع الخاص — نتجاهل بهدوء */
  }
  window.dispatchEvent(new Event(EVENT));
}

/** يضيف المنتج للمفضلة أو يرفعه منها؛ ويُرجع الحالة الجديدة. */
export function toggleFavorite(item: FavoriteItem): boolean {
  const items = read();
  if (items.some((i) => i.productId === item.productId)) {
    write(items.filter((i) => i.productId !== item.productId));
    return false;
  }
  write([item, ...items]);
  track('AddToWishlist', { content_ids: [item.productId], content_name: item.productName, content_type: 'product' });
  return true;
}

export function removeFavorite(productId: string) {
  write(read().filter((i) => i.productId !== productId));
}

// ── مخزن للاشتراك (useSyncExternalStore) ────────────────────

export function subscribeFavorites(callback: () => void): () => void {
  window.addEventListener(EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener('storage', callback);
  };
}

let cache: FavoriteItem[] = [];
let cacheRaw = '';
/** لقطة مستقرّة (نفس المرجع ما لم تتغيّر) لتجنّب إعادة تصيير لا نهائية. */
export function getFavoritesSnapshot(): FavoriteItem[] {
  if (typeof window === 'undefined') return cache;
  const raw = window.localStorage.getItem(KEY) ?? '';
  if (raw !== cacheRaw) {
    cacheRaw = raw;
    cache = read();
  }
  return cache;
}

export const NO_FAVORITES: FavoriteItem[] = [];
