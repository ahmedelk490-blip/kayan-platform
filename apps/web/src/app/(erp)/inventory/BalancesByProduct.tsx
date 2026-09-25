'use client';

import { useMemo, useState } from 'react';
import { Table } from '@/components/crud/Shell';
import { normalizeDigits } from '@/lib/num';
import { MinStockCell } from './MinStockCell';

/**
 * أرصدة المنتجات مجمَّعةً بالموديل.
 *
 * ── لماذا لا جدولٌ مسطَّح ──────────────────────────────────
 *
 * ١٣٧ صفَّ متغيّر (موديل × لون × مقاس) في جدولٍ واحد يُخفي السؤال الذي
 * يُسأل فعلاً كل يوم: «شنو ناقص من التيشيرت الموديل ١؟». الجواب كان يتطلّب
 * تمريراً طويلاً وقراءة أسماءٍ متشابهة صفاً صفاً.
 *
 * فالشاشة صارت بطاقةً لكل موديل: عنوانها يقول كم صنفاً نفد وكم قارب، وجسمها
 * صفٌّ لكل لون ومقاساتُه مربّعاتٌ ملوّنة — النافذ أحمر والقارب برتقالي. تُقرأ
 * البطاقة بنظرة، لا بقراءة.
 *
 * والبطاقات التي فيها نقصٌ تُفتح من نفسها والسليمة تبقى مطويّة: ما يحتاج
 * تصرّفاً يُواجهك، وما لا يحتاجه لا يزحم.
 *
 * ── وما زال كل شيءٍ موجوداً ────────────────────────────────
 *
 * المخزن والموقع والمحجوز والتالف والقيمة والحدّ الأدنى لم تُحذف: هي خلف
 * «التفاصيل» داخل كل بطاقة، لمن يحتاجها ساعة يحتاجها.
 */

export interface BalanceCell {
  /** معرّف صفّ الرصيد — مفتاح تحرير الحدّ الأدنى. */
  id: string;
  sizeCode: string;
  sizeOrder: number;
  /** القطع رقماً — للعرض داخل المربّع وللفرز. */
  onHand: number;
  onHandText: string;
  reservedText: string;
  availableText: string;
  availableNeg: boolean;
  damagedText: string;
  warehouse: string;
  location: string;
  /** null لمن لا يملك صلاحية التكلفة — القيمة لا تصل المتصفّح أصلاً. */
  valueText: string | null;
  minStock: number;
  minStockText: string;
  state: 'out' | 'low' | 'ok';
}

export interface ColorGroup {
  key: string;
  name: string;
  hex: string | null;
  cells: BalanceCell[];
}

export interface ProductGroup {
  id: string;
  name: string;
  sku: string;
  colors: ColorGroup[];
  /** إجمالي القطع في كل مقاسات الموديل وألوانه. */
  pieces: number;
  dozens: number;
  loose: number;
  perDozen: number;
  out: number;
  low: number;
  variants: number;
  valueText: string | null;
}

const FILTERS = [
  { key: 'all', label: 'الكل' },
  { key: 'short', label: 'فيه ناقص' },
  { key: 'out', label: 'نافذ تماماً' },
] as const;
type FilterKey = (typeof FILTERS)[number]['key'];

/** ألوان المربّع: النافذ يقفز للعين، والقارب يليه، والسليم هادئ. */
const CELL_TONE: Record<BalanceCell['state'], string> = {
  out: 'border-bad bg-bad-soft text-bad',
  low: 'border-warn bg-warn-soft text-warn',
  ok: 'border-line-2 bg-card text-txt',
};

export function BalancesByProduct({
  groups,
  canWrite,
  seeCosts,
}: {
  groups: ProductGroup[];
  canWrite: boolean;
  seeCosts: boolean;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  // ما فتحه المستخدم أو طواه بيده يغلب الافتراض — والافتراض: افتح ما فيه نقص.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const [details, setDetails] = useState<Record<string, boolean>>({});

  const visible = useMemo(() => {
    const q = normalizeDigits(query).trim().toLowerCase();
    const byFilter = groups.filter((g) =>
      filter === 'out' ? g.out > 0 : filter === 'short' ? g.out + g.low > 0 : true,
    );
    if (!q) return byFilter;
    // البحث يطابق اسم الموديل أو كوده، وإلا فلونه أو مقاسه — فيبقى الموديل
    // ظاهراً بما طابق منه وحده.
    return byFilter
      .map((g) => {
        if (g.name.toLowerCase().includes(q) || g.sku.toLowerCase().includes(q)) return g;
        const colors = g.colors
          .map((c) =>
            c.name.toLowerCase().includes(q)
              ? c
              : { ...c, cells: c.cells.filter((x) => x.sizeCode.toLowerCase().includes(q)) },
          )
          .filter((c) => c.cells.length > 0);
        return colors.length > 0 ? { ...g, colors } : null;
      })
      .filter((g): g is ProductGroup => g !== null);
  }, [groups, query, filter]);

  const totalOut = groups.reduce((n, g) => n + g.out, 0);
  const totalLow = groups.reduce((n, g) => n + g.low, 0);

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ابحث بالموديل أو اللون أو المقاس…"
          className="erp-input w-full max-w-xs py-2.5"
        />
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
                filter === f.key
                  ? 'border-brand bg-brand-soft text-brand'
                  : 'border-line-2 text-txt-2 hover:border-line'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <p className="mb-4 text-[0.7rem] leading-[1.8] text-txt-4">
        {groups.length} موديل · {totalOut > 0 && <span className="text-bad">{totalOut} صنف نافذ</span>}
        {totalOut > 0 && totalLow > 0 && ' · '}
        {totalLow > 0 && <span className="text-warn">{totalLow} قارب على النفاد</span>}
        {totalOut === 0 && totalLow === 0 && <span className="text-ok">كل الأصناف فوق حدّها</span>}
      </p>

      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-card-2 px-4 py-8 text-center text-sm text-txt-3">
          لا موديل يطابق البحث.
        </p>
      ) : (
        <div className="space-y-3">
          {visible.map((g) => {
            const short = g.out + g.low > 0;
            const open = toggled[g.id] ?? short;
            return (
              <article
                key={g.id}
                className={`overflow-hidden rounded-xl border ${short ? 'border-bad/50' : 'border-line'} bg-card-2`}
              >
                <button
                  type="button"
                  onClick={() => setToggled((t) => ({ ...t, [g.id]: !open }))}
                  className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 text-start transition-colors hover:bg-card"
                >
                  <span className="flex min-w-0 flex-wrap items-center gap-2">
                    <span aria-hidden className="text-xs text-txt-4">{open ? '▾' : '◂'}</span>
                    <span className="text-sm font-semibold text-txt">{g.name}</span>
                    {g.out > 0 && (
                      <span className="rounded-full border border-bad bg-bad-soft px-2.5 py-0.5 text-[0.7rem] font-medium text-bad">
                        {g.out} نفد
                      </span>
                    )}
                    {g.low > 0 && (
                      <span className="rounded-full border border-warn bg-warn-soft px-2.5 py-0.5 text-[0.7rem] font-medium text-warn">
                        {g.low} قارب
                      </span>
                    )}
                    {!short && (
                      <span className="rounded-full border border-line-2 px-2.5 py-0.5 text-[0.7rem] text-ok">
                        سليم
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-end">
                    <span className="tnum block text-sm font-bold text-brand">
                      {g.pieces.toLocaleString('en-US')} قطعة
                    </span>
                    <span className="tnum block text-[0.65rem] text-txt-4">
                      {g.dozens} دست{g.loose > 0 ? ` و${g.loose} قطعة` : ''} · {g.variants} صنف
                    </span>
                  </span>
                </button>

                {open && (
                  <div className="border-t border-line px-4 py-3">
                    {/* صفٌّ لكل لون، ومقاساته مربّعاتٌ — اللون يُقرأ من اليمين
                        والمقاسات تمتدّ يساراً بترتيبها الصحيح لا الأبجدي. */}
                    <div className="space-y-2.5">
                      {g.colors.map((c) => (
                        <div key={c.key} className="flex flex-wrap items-center gap-2">
                          <span className="flex w-28 shrink-0 items-center gap-1.5">
                            {c.hex && (
                              <span
                                aria-hidden
                                style={{ background: c.hex }}
                                className="h-3 w-3 shrink-0 rounded-full border border-line-2"
                              />
                            )}
                            <span className="truncate text-xs font-medium text-txt-2">{c.name}</span>
                          </span>
                          <span className="flex flex-wrap gap-1.5">
                            {c.cells.map((x) => (
                              <span
                                key={x.id}
                                title={`${x.sizeCode} — الرصيد ${x.onHandText}، المتاح ${x.availableText}، الحدّ ${x.minStockText}`}
                                className={`flex min-w-[3.25rem] flex-col items-center rounded-lg border px-2 py-1 ${CELL_TONE[x.state]}`}
                              >
                                <span className="text-[0.6rem] leading-tight opacity-80">{x.sizeCode}</span>
                                {/* السالب يُقرأ «٣-» في سياق عربي، فيُثبَّت اتجاه الرقم. */}
                                <span dir="ltr" className="tnum text-sm font-bold leading-tight">
                                  {x.onHand}
                                </span>
                              </span>
                            ))}
                          </span>
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => setDetails((d) => ({ ...d, [g.id]: !d[g.id] }))}
                      className="mt-3 text-[0.7rem] text-brand hover:underline"
                    >
                      {details[g.id] ? 'إخفاء التفاصيل' : 'التفاصيل — المخزن والمحجوز والحدّ الأدنى'}
                    </button>

                    {details[g.id] && (
                      <div className="mt-2">
                        <Table
                          headers={[
                            'اللون / المقاس', 'المخزن', 'الموقع', 'الرصيد', 'محجوز', 'المتاح', 'تالف',
                            ...(seeCosts ? ['قيمة الرصيد'] : []),
                            'الحد الأدنى',
                          ]}
                          empty={false}
                        >
                          {g.colors.flatMap((c) =>
                            c.cells.map((x) => (
                              <tr key={`d-${x.id}`} className="hover:bg-card-2">
                                <td className="px-4 py-3 text-txt">
                                  {c.name} · {x.sizeCode}
                                </td>
                                <td className="px-4 py-3 text-txt-2">{x.warehouse}</td>
                                <td dir="ltr" className="px-4 py-3 text-start text-txt-3">{x.location}</td>
                                <td className="tnum px-4 py-3 text-txt-2">{x.onHandText}</td>
                                <td className="tnum px-4 py-3 text-txt-2">{x.reservedText}</td>
                                <td
                                  className={`tnum px-4 py-3 font-medium ${x.availableNeg ? 'text-bad' : 'text-txt'}`}
                                >
                                  {x.availableText}
                                </td>
                                <td className="tnum px-4 py-3 text-txt-2">{x.damagedText}</td>
                                {seeCosts && (
                                  <td className="tnum px-4 py-3 text-txt-2">
                                    {x.valueText ?? <span className="text-txt-4">—</span>}
                                  </td>
                                )}
                                <td className="tnum px-4 py-3">
                                  {canWrite ? (
                                    <MinStockCell stockId={x.id} value={x.minStock} />
                                  ) : x.state === 'low' || x.state === 'out' ? (
                                    <span className="text-bad">{x.minStockText}</span>
                                  ) : (
                                    <span className="text-txt-3">{x.minStockText}</span>
                                  )}
                                </td>
                              </tr>
                            )),
                          )}
                        </Table>
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      <p className="mt-3 text-[0.7rem] leading-[1.8] text-txt-4">
        الرقم داخل المربّع هو رصيد ذلك المقاس. الأحمر نفد (صفر أو أقل)، والبرتقالي بلغ
        حدّه الأدنى أو نزل تحته، والباقي سليم. اضبط الحدّ الأدنى من «التفاصيل» ليُنبّهك
        النظام قبل النفاد لا بعده.
      </p>
    </section>
  );
}
