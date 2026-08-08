'use client';

import { motion } from 'motion/react';

export interface ActivityItem {
  id: string;
  action: string;
  actor: string;
  /** ISO string — formatted on the client so the timezone is the user's. */
  at: string;
}

/** ترجمة أكواد التدقيق إلى عربية مقروءة. */
const ACTION_AR: Record<string, string> = {
  'auth.login.success': 'تسجيل دخول ناجح',
  'auth.login.failed': 'محاولة دخول فاشلة',
  'products.import': 'استيراد منتجات',
};

const ACTION_TONE: Record<string, string> = {
  'auth.login.success': 'bg-ok',
  'auth.login.failed': 'bg-bad',
  'products.import': 'bg-brand',
};

export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-txt-3">لا يوجد نشاط مسجّل بعد.</p>;
  }

  return (
    <ul className="relative">
      {/* الخط الرأسي للجدول الزمني */}
      <span aria-hidden="true" className="absolute bottom-3 end-[5px] top-3 w-px bg-line" />

      {items.map((item, index) => (
        <motion.li
          key={item.id}
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.5 + index * 0.06, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="relative flex items-start justify-between gap-4 pe-6 py-2.5"
        >
          <span
            aria-hidden="true"
            className={`absolute end-0 top-4 h-2.5 w-2.5 rounded-full ring-4 ring-card ${
              ACTION_TONE[item.action] ?? 'bg-txt-4'
            }`}
          />

          <div className="min-w-0">
            <p className="truncate text-sm text-txt-2">
              {ACTION_AR[item.action] ?? item.action}
            </p>
            <p className="text-[0.7rem] text-txt-4">{item.actor}</p>
          </div>

          <time
            dateTime={item.at}
            className="tnum shrink-0 text-[0.7rem] text-txt-4"
            suppressHydrationWarning
          >
            {new Date(item.at).toLocaleString('ar-EG', {
              day: '2-digit',
              month: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </time>
        </motion.li>
      ))}
    </ul>
  );
}
