'use client';

import Link from 'next/link';
import { motion } from 'motion/react';

/**
 * ترويسة الترحيب — هيرو متدرّج بألوان الهوية يعرض نبض اليوم.
 *
 * كانت لوحاً باهتاً بسطر ترحيب؛ صارت واجهة حيّة: تدرّج نبيتي بتوهّجين
 * زخرفيين، وتحت الترحيب أرقام اليوم الفعلية (مبيعات ومقبوض) — أول ما يهم
 * المدير صباحاً قبل أي جدول.
 *
 * The date is formatted on the client to avoid a hydration mismatch: the
 * server renders in its own timezone, the browser in the user's, and Arabic
 * date strings differ between them.
 */
export function WelcomeHeader({
  name,
  roleAr,
  today,
}: {
  name: string;
  roleAr: string;
  /** أرقام اليوم الحيّة (بتوقيت بغداد) — تُمرَّر من الخادم منسّقةً جاهزة. */
  today?: { sales: string; collected: string; invoices: number };
}) {
  const now = new Date();

  const greeting = now.getHours() < 12 ? 'صباح الخير' : 'مساء الخير';

  const dateAr = now.toLocaleDateString('ar-EG', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <motion.header
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="relative overflow-hidden rounded-2xl p-6 text-white md:p-8"
      style={{ background: 'linear-gradient(135deg, #431a27 0%, #5c2535 45%, #7d3349 100%)' }}
    >
      {/* توهّجان زخرفيان يكسران الجمود دون إزعاج القراءة. */}
      <div aria-hidden className="pointer-events-none absolute -start-16 -top-24 h-60 w-60 rounded-full bg-white/10 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-28 end-8 h-72 w-72 rounded-full bg-[#e8a9bf]/20 blur-3xl" />

      <div className="relative">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.15, duration: 0.5 }}
              className="text-xs font-medium text-white/80"
            >
              {greeting} 👋
            </motion.p>

            <motion.h2
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.22, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="mt-1.5 text-2xl font-bold md:text-3xl"
            >
              {name}
            </motion.h2>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.32, duration: 0.5 }}
              className="mt-1.5 text-xs text-white/70"
            >
              {roleAr}
            </motion.p>
          </div>

          <motion.p
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.38, duration: 0.5 }}
            className="text-xs text-white/70"
          >
            {dateAr}
          </motion.p>
        </div>

        {today && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
            className="mt-6 grid gap-3 sm:grid-cols-3"
          >
            <TodayPill icon="🧾" label="مبيعات اليوم" value={`${today.sales} د.ع`} sub={`${today.invoices} فاتورة`} />
            <TodayPill icon="💵" label="المقبوض اليوم" value={`${today.collected} د.ع`} />
            <Link
              href="/reports/daily"
              className="flex items-center justify-between gap-3 rounded-xl border border-white/20 bg-white/10 px-4 py-3 backdrop-blur transition-colors hover:bg-white/20"
            >
              <span>
                <span className="block text-[0.7rem] text-white/70">التفاصيل الكاملة</span>
                <span className="mt-0.5 block text-sm font-bold">يومية اليوم</span>
              </span>
              <span className="text-xl">📊</span>
            </Link>
          </motion.div>
        )}
      </div>
    </motion.header>
  );
}

function TodayPill({
  icon,
  label,
  value,
  sub,
}: {
  icon: string;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/20 bg-white/10 px-4 py-3 backdrop-blur">
      <span>
        <span className="block text-[0.7rem] text-white/70">{label}</span>
        <span className="tnum mt-0.5 block text-sm font-bold">{value}</span>
        {sub && <span className="tnum block text-[0.65rem] text-white/60">{sub}</span>}
      </span>
      <span className="text-xl">{icon}</span>
    </div>
  );
}
