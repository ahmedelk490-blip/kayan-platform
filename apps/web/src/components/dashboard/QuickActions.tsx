'use client';

import Link from 'next/link';
import { motion } from 'motion/react';

export interface QuickAction {
  href: string;
  label: string;
  description: string;
  available: boolean;
  /** أيقونة البلاطة — إيموجي كبير يجعل الزر يُعرف من شكله. */
  emoji?: string;
  /** تدرّج البلاطة — صفوف Tailwind كاملة (تُكتب حرفياً ليراها الماسح). */
  gradient?: string;
}

/**
 * إجراءات سريعة — بلاطات ملوّنة كبيرة، كل فعل بلون هويته.
 *
 * كانت قائمة سطور رمادية مدفونة؛ صارت شبكة بلاطات متدرّجة بأيقونات تُقرأ من
 * بعيد وتُلمس بسهولة على الجوال — شغل اليوم يبدأ من هنا.
 *
 * Unavailable actions render as inert text, not disabled links — a link that
 * looks clickable and goes to a 404 is worse than one that plainly is not
 * there yet.
 */
export function QuickActions({ actions }: { actions: QuickAction[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {actions.map((action, index) => (
        <motion.li
          key={action.href}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 + index * 0.05, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        >
          {action.available ? (
            <Link
              href={action.href}
              className={`group relative flex h-full flex-col gap-1.5 overflow-hidden rounded-2xl bg-gradient-to-br ${action.gradient ?? 'from-slate-500 to-slate-700'} p-4 text-white shadow-md transition-all duration-300 hover:-translate-y-1 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white`}
            >
              {/* توهّج خفيف يتحرك مع المرور — حياة بلا ضجيج. */}
              <span
                aria-hidden
                className="pointer-events-none absolute -end-6 -top-8 h-20 w-20 rounded-full bg-white/15 blur-xl transition-transform duration-300 group-hover:scale-150"
              />
              <span className="text-2xl leading-none">{action.emoji ?? '⚡'}</span>
              <span className="mt-1 text-sm font-bold leading-tight">{action.label}</span>
              <span className="text-[0.66rem] leading-snug text-white/75">{action.description}</span>
            </Link>
          ) : (
            <div className="flex h-full flex-col gap-1.5 rounded-2xl border border-dashed border-line p-4 opacity-55">
              <span className="text-2xl leading-none grayscale">{action.emoji ?? '⚡'}</span>
              <span className="mt-1 text-sm text-txt-3">{action.label}</span>
              <span className="text-[0.66rem] text-txt-4">{action.description}</span>
            </div>
          )}
        </motion.li>
      ))}
    </ul>
  );
}
