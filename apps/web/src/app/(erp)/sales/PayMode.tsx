'use client';

/**
 * حالة الدفع لحظة البيع — أزرارٌ ظاهرة بدل خانة مبلغٍ يُفهم منها ضمناً (بطلب
 * المالك: «مدفوع كامل، مدفوع جزء، مستحقات للطلب»). كان الظاهر «إصدار وتحصيل
 * فوري» وحده، والجزئي والآجل مخفيّين في تعديل رقم المبلغ.
 *
 * يصل الخادمَ paymentMode: «كامل» يحسبه من إجماليه، و«مستحقات» صفرٌ مهما كان
 * في خانة المبلغ، و«جزء» بما كُتب ولا يمرّ فارغاً.
 */
export type PayMode = 'FULL' | 'PART' | 'DUE' | 'DRAFT';

const PAY_MODE_AR: Record<PayMode, string> = {
  FULL: 'مدفوع كامل',
  PART: 'مدفوع جزء',
  DUE: 'مستحقات (آجل)',
  DRAFT: 'مسودة',
};

export function PayModePills({
  value,
  onChange,
  modes,
}: {
  value: PayMode;
  onChange: (mode: PayMode) => void;
  modes: PayMode[];
}) {
  return (
    <div role="radiogroup" aria-label="حالة الدفع" className="flex flex-wrap gap-2">
      {modes.map((m) => {
        const on = value === m;
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(m)}
            className={`rounded-full border px-4 py-2 text-xs font-medium transition-colors ${
              on ? 'border-brand bg-brand text-white' : 'border-line-2 bg-card text-txt-2'
            }`}
          >
            {PAY_MODE_AR[m]}
          </button>
        );
      })}
    </div>
  );
}
