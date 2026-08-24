'use client';

/**
 * سلة تسوّق خفيفة على المتصفح (localStorage) — بلا خادم ولا حساب.
 *
 * العميل يجمّع أصنافاً من صفحات المنتجات، والسلة تمشي معه بين الصفحات، ثم
 * يُتمّ الطلب مرة واحدة فيصل للـERP كطلب واحد بعدّة أصناف. متجر متكامل يأتي
 * لاحقاً؛ هذا يكفي «اجمع واطلب».
 */

const KEY = 'kayan-cart';
const EVENT = 'kayan-cart-changed';

export interface CartItem {
  /** مفتاح فريد للتركيبة: منتج + لون + مقاس، حتى تُدمج نفس التركيبة. */
  key: string;
  productId: string;
  productName: string;
  image?: string | null;
  colorLabel?: string;
  sizeLabel?: string;
  quantity: number;
  /** نص السعر للعرض فقط — التسعير الرسمي يتم في الفاتورة. */
  priceText?: string;
}

function read(): CartItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(items: CartItem[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* حصة التخزين ممتلئة أو الوضع الخاص — نتجاهل بهدوء */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function itemKey(productId: string, color?: string, size?: string): string {
  return [productId, color ?? '', size ?? ''].join('|');
}

export function addToCart(item: CartItem) {
  const items = read();
  const existing = items.find((i) => i.key === item.key);
  if (existing) existing.quantity += item.quantity;
  else items.push(item);
  write(items);
}

export function setQty(key: string, quantity: number) {
  const items = read().map((i) => (i.key === key ? { ...i, quantity: Math.max(1, Math.round(quantity)) } : i));
  write(items);
}

export function removeItem(key: string) {
  write(read().filter((i) => i.key !== key));
}

export function clearCart() {
  write([]);
}

/** يفتح لوحة السلة — لزرّ «اشترِ الآن» بعد الإضافة. */
export function openCart() {
  window.dispatchEvent(new Event('kayan-cart-open'));
}

// ── مخزن للاشتراك (useSyncExternalStore) ────────────────────

export function subscribe(callback: () => void): () => void {
  window.addEventListener(EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener('storage', callback);
  };
}

/** لقطة مستقرّة (نفس المرجع ما لم تتغيّر) لتجنّب إعادة تصيير لا نهائية. */
let cache: CartItem[] = [];
let cacheRaw = '';
export function getSnapshot(): CartItem[] {
  if (typeof window === 'undefined') return cache;
  const raw = window.localStorage.getItem(KEY) ?? '';
  if (raw !== cacheRaw) {
    cacheRaw = raw;
    cache = read();
  }
  return cache;
}
