'use client';

import { motion } from 'motion/react';

export interface ActivityItem {
  id: string;
  action: string;
  actor: string;
  /** ISO string — formatted on the client so the timezone is the user's. */
  at: string;
}

/**
 * ترجمة أكواد التدقيق إلى عربية مقروءة.
 *
 * كل فعل مهمّ في النظام يُسجَّل، وهذه الخريطة تجعله يُقرأ: أمر يُؤكَّد، فاتورة
 * تُصدَر، مشتريات تُستلَم، مخزون يُصرَف. بلا ترجمة يظهر الكود الخام
 * (order.confirm) فيبدو النظام أصمّ — واللوحة هنا لتُسمع كل ذلك.
 */
const ACTION_AR: Record<string, string> = {
  'auth.login.success': 'تسجيل دخول',
  'auth.login.failed': 'محاولة دخول فاشلة',
  'products.import': 'استيراد منتجات',
  'product.create': 'منتج جديد',
  'product.update': 'تعديل منتج',
  'catalog.create': 'إضافة للتصنيفات',
  'quotation.create': 'عرض سعر جديد',
  'quotation.update': 'تعديل عرض سعر',
  'quotation.status': 'تغيّر حالة عرض سعر',
  'quotation.convert': 'تحويل عرض إلى أمر بيع',
  'quotation.duplicate': 'نسخ عرض سعر',
  'order.create': 'أمر بيع جديد',
  'order.confirm': 'تأكيد أمر بيع — حجز مخزون',
  'order.status': 'تغيّر حالة أمر بيع',
  'order.cancel': 'إلغاء أمر بيع',
  'invoice.create': 'فاتورة جديدة',
  'invoice.issue': 'إصدار فاتورة',
  'invoice.void': 'إلغاء فاتورة',
  'payment.record': 'تحصيل دفعة',
  'payment.reverse': 'عكس دفعة',
  'purchase.create': 'أمر شراء جديد',
  'purchase.receive': 'استلام مشتريات — إضافة للمخزون',
  'purchase.status': 'تغيّر حالة أمر شراء',
  'production.create': 'أمر إنتاج جديد',
  'production.status': 'تغيّر حالة إنتاج',
  'production.update': 'تعديل أمر إنتاج',
  'stock.levels': 'تعديل رصيد المخزون',
  'customer.create': 'عميل جديد',
  'customer.update': 'تعديل عميل',
  'damage.create': 'تسجيل هالك',
  'expense.create': 'مصروف جديد',
  'formula.publish': 'نشر معادلة تكلفة',
  'cost.calculate': 'حساب تكلفة',
  'settings.update': 'تعديل الإعدادات',
  'site-content.save': 'تعديل نصوص الموقع',
  'hero-slide.create': 'إضافة صورة واجهة',
};

/** لون النقطة: أخضر لِما يدخل قيمة، أحمر لِما يُلغى أو يفشل، نبيتي للباقي. */
const ACTION_TONE: Record<string, string> = {
  'auth.login.failed': 'bg-bad',
  'order.cancel': 'bg-bad',
  'invoice.void': 'bg-bad',
  'payment.reverse': 'bg-bad',
  'order.confirm': 'bg-ok',
  'invoice.issue': 'bg-ok',
  'payment.record': 'bg-ok',
  'purchase.receive': 'bg-ok',
  'order.create': 'bg-ok',
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
