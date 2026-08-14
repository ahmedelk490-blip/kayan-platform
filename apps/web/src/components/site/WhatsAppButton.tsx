'use client';

import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';

/**
 * زر التواصل عبر واتساب.
 *
 * بألوان الهوية لا بأخضر واتساب. الأخضر لون علامة أخرى، ووضعه في زاوية
 * الصفحة يضع علامتين متنافستين في مشهد واحد — والهوية هنا هي هوية كيان.
 * الأيقونة وحدها تكفي للتعرّف؛ لا أحد يحتاج اللون ليعرف واتساب.
 *
 * لا يُعرض إطلاقاً بلا رقم. زر يفتح محادثة مع لا أحد أسوأ من غيابه.
 *
 * يظهر بعد تمرير قصير لا فوراً: زر عائم يقفز على المستخدم في اللحظة
 * الأولى يغطّي الهيرو الذي بُني بعناية.
 */
export function WhatsAppButton({ href }: { href: string | null }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!href) return undefined;
    const onScroll = () => setShown(window.scrollY > 320);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [href]);

  if (!href) return null;

  return (
    <motion.a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="تواصل معنا عبر واتساب"
      initial={false}
      animate={
        shown
          ? { opacity: 1, scale: 1, pointerEvents: 'auto' }
          : { opacity: 0, scale: reduced ? 1 : 0.8, pointerEvents: 'none' }
      }
      transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 320, damping: 26 }}
      whileHover={reduced ? undefined : { scale: 1.06 }}
      whileTap={reduced ? undefined : { scale: 0.96 }}
      className="group fixed bottom-6 end-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-on-brand shadow-[0_10px_30px_-8px_rgba(0,0,0,0.55)] outline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
    >
      {/* نبضة واحدة هادئة عند الظهور، لا حلقة لا تنتهي. */}
      {!reduced && shown && (
        <motion.span
          aria-hidden
          initial={{ opacity: 0.5, scale: 1 }}
          animate={{ opacity: 0, scale: 1.7 }}
          transition={{ duration: 1.6, ease: 'easeOut' }}
          className="pointer-events-none absolute inset-0 rounded-full bg-brand"
        />
      )}

      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden
        className="relative h-7 w-7"
      >
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.149-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884a9.82 9.82 0 016.988 2.898 9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
      </svg>

      {/* تسمية تظهر عند المرور — مخفية عن قارئ الشاشة لأن aria-label يغني. */}
      <span
        aria-hidden
        className="pointer-events-none absolute end-full me-3 whitespace-nowrap rounded-full bg-panel px-3 py-1.5 text-xs text-body opacity-0 shadow-lg transition-opacity duration-200 group-hover:opacity-100"
      >
        راسلنا على واتساب
      </span>
    </motion.a>
  );
}
