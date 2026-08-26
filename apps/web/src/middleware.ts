import { NextResponse } from 'next/server';

/**
 * لا كاش على صفحات الموقع والنظام — أي تعديل يظهر فوراً.
 *
 * الصفحات كلها `force-dynamic`، لكن Next لا يُرسل ترويسة كاش صريحة، فيبقى
 * الباب مفتوحاً أمام كاش المتصفّح أو كاش الخادم (LiteSpeed على Hostinger)
 * ليحتفظ بنسخة قديمة من HTML بعد تعديل منتج أو نصّ. هنا نحسم الأمر من المصدر:
 * كل استجابة صفحة تُوسَم `no-store` فلا تُخزَّن في أي مكان.
 *
 * المستثنى (عبر الـmatcher) يبقى مُخزَّناً كما ينبغي:
 *  - `/_next/static` و`/_next/image`: أصول ببصمة محتوى، لا تَبْلى أبداً.
 *  - `/product-img` و`/hero/img`: الصورة تُستبدل بمعرّف جديد، فتخزينها الطويل آمن.
 *  - `favicon` / `robots` / `sitemap`: ملفات ثابتة.
 *
 * الأصول والصور تضبط ترويسات الكاش الخاصة بها في معالِجاتها؛ هذا لا يمسّها.
 */
export function middleware() {
  const res = NextResponse.next();
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.headers.set('Pragma', 'no-cache');
  res.headers.set('Expires', '0');
  return res;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|product-img|hero/img|favicon.ico|robots.txt|sitemap.xml).*)',
  ],
};
