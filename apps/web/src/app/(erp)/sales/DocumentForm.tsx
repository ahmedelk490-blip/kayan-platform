'use client';

import { useActionState, useState } from 'react';
import {
  calcLine,
  calcDocument,
  formatMoney,
  applicableTier,
  dec,
  PRICE_SERVICE_AR,
  PAYMENT_METHODS,
  PAYMENT_METHOD_AR,
  type PriceService,
} from '@erp/domain';
import { Field, TextArea, Select, SubmitButton, FormError } from '@/components/crud/Form';
import type { FormState } from './shared';

/** شريحة سعر مبسّطة تعبر إلى العميل — أرقام لا Decimal. */
export interface VariantTier {
  service: string;
  minQty: number;
  maxQty: number | null;
  price: number;
  variantId: string | null;
  isActive: boolean;
}

export interface VariantOption {
  value: string;
  label: string;
  productId: string;
  productName: string;
  colorId: string | null;
  colorName: string | null;
  sizeId: string | null;
  sizeCode: string | null;
  price: number;
  available: number;
  /** شرائح سعر منتج هذا المتغيّر — السعر الحقيقي حسب الخدمة والكمية. */
  tiers: VariantTier[];
}

/** سيريه/طقم: توزيع مقاسات جاهز لمنتج، يتوسّع إلى سطور بضغطة. */
export interface BundleOption {
  id: string;
  productId: string;
  nameAr: string;
  /** سعر الدست لهذه السيريه (اختياري) — إن وُجد يُطبَّق سعر القطعة = السعر ÷ قطع السيريه. */
  price: number | null;
  lines: { sizeId: string; sizeCode: string; quantity: number }[];
}

export interface DocLine {
  /** اختيار متسلسل: المنتج ثم اللون ثم المقاس يحدّدون المتغيّر. */
  productId: string;
  colorId: string;
  sizeId: string;
  variantId: string;
  /** الخدمة المختارة (تطريز/DTF…)، تحدّد الشريحة والسعر. */
  service: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  taxRate: number;
  notes: string;
}

export interface DocValues {
  customerId?: string | null;
  notes?: string | null;
  discountAmount?: number;
  discountPercent?: number;
  dateA?: string;
  dateB?: string;
  lines?: DocLine[];
}

const emptyLine = (): DocLine => ({
  productId: '',
  colorId: '',
  sizeId: '',
  variantId: '',
  service: '',
  quantity: 1,
  unitPrice: 0,
  discountAmount: 0,
  taxRate: 0,
  notes: '',
});

/** خدمات هذا المتغيّر — المميّزة من شرائحه، بترتيب ظهورها. */
function servicesOf(v: VariantOption): string[] {
  const seen: string[] = [];
  for (const t of v.tiers) if (!seen.includes(t.service)) seen.push(t.service);
  return seen;
}

/** قيمة فريدة مع تسمية — للقوائم المنسدلة المشتقّة. */
interface Choice {
  id: string;
  label: string;
}

/** المنتجات المميّزة من المتغيّرات، بترتيب ظهورها. */
function productsOf(variants: VariantOption[]): Choice[] {
  const seen = new Map<string, string>();
  for (const v of variants) if (!seen.has(v.productId)) seen.set(v.productId, v.productName);
  return [...seen].map(([id, label]) => ({ id, label }));
}

/** ألوان منتج (بلا التكرار). قد تكون فارغة لمنتج بلا ألوان. */
function colorsOf(variants: VariantOption[], productId: string): Choice[] {
  const seen = new Map<string, string>();
  for (const v of variants)
    if (v.productId === productId && v.colorId && v.colorName && !seen.has(v.colorId))
      seen.set(v.colorId, v.colorName);
  return [...seen].map(([id, label]) => ({ id, label }));
}

/** مقاسات منتج بلونٍ محدّد (أو بلا لون). */
function sizesOf(variants: VariantOption[], productId: string, colorId: string): Choice[] {
  const seen = new Map<string, string>();
  for (const v of variants)
    if (
      v.productId === productId &&
      (v.colorId ?? '') === colorId &&
      v.sizeId &&
      v.sizeCode &&
      !seen.has(v.sizeId)
    )
      seen.set(v.sizeId, v.sizeCode);
  return [...seen].map(([id, label]) => ({ id, label }));
}

/** المتغيّر المطابق للاختيار (منتج/لون/مقاس)، أو null. */
function resolveVariant(
  variants: VariantOption[],
  productId: string,
  colorId: string,
  sizeId: string,
): VariantOption | null {
  if (!productId) return null;
  const matches = variants.filter(
    (v) =>
      v.productId === productId && (v.colorId ?? '') === colorId && (v.sizeId ?? '') === sizeId,
  );
  return matches[0] ?? null;
}

/** يملأ حقول الاختيار (منتج/لون/مقاس) من المتغيّر المحفوظ عند التعديل. */
function hydrate(line: DocLine, variants: VariantOption[]): DocLine {
  if (line.variantId && !line.productId) {
    const v = variants.find((x) => x.value === line.variantId);
    if (v) return { ...line, productId: v.productId, colorId: v.colorId ?? '', sizeId: v.sizeId ?? '' };
  }
  return line;
}

/**
 * Shared editor for quotations and sales orders — identical line structure,
 * so one component rather than two that drift apart.
 *
 * Totals shown here are a preview only. The server recalculates from the
 * submitted values and stores its own result, so a tampered client cannot
 * change what is recorded.
 */
export function DocumentForm({
  action,
  customers,
  variants,
  values,
  labels,
  submitLabel,
  instantIssue = false,
  instantDefault = false,
  bundles = [],
  webOrderId,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  customers: { value: string; label: string }[];
  variants: VariantOption[];
  values?: DocValues;
  labels: { dateA: string; dateB: string };
  submitLabel?: string;
  /** يُتيح «إصدار وتحصيل فوري» — خاص بالفاتورة المباشرة فقط. */
  instantIssue?: boolean;
  /** يبدأ «إصدار وتحصيل فوري» مفعّلاً — للوحة الكاشير. */
  instantDefault?: boolean;
  /** السيريات/الأطقم المتاحة — لإضافة توزيع مقاسات دفعة واحدة. */
  bundles?: BundleOption[];
  /** طلب موقع مصدر هذه الفاتورة — يُوسَم «تحوّل» عند الإنشاء. */
  webOrderId?: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const [lines, setLines] = useState<DocLine[]>(() =>
    values?.lines?.length ? values.lines.map((l) => hydrate(l, variants)) : [emptyLine()],
  );
  const [docDiscount, setDocDiscount] = useState(values?.discountAmount ?? 0);
  const [docDiscountPct, setDocDiscountPct] = useState(values?.discountPercent ?? 0);
  const [issueNow, setIssueNow] = useState(instantDefault);
  const [payMethod, setPayMethod] = useState('CASH');
  const [payAmount, setPayAmount] = useState(0);

  // منتقي السيريه: منتج ← لون ← سيريه ← عدد الأطقم، يتوسّع إلى سطور.
  const [seriesProductId, setSeriesProductId] = useState('');
  const [seriesColorId, setSeriesColorId] = useState('');
  const [seriesBundleId, setSeriesBundleId] = useState('');
  const [seriesCount, setSeriesCount] = useState(1);
  const [seriesMsg, setSeriesMsg] = useState<string | null>(null);

  const products = productsOf(variants);

  // منتجات لها سيريات فقط، بأسمائها؛ وألوان وسيريات المنتج المختار.
  const bundleProductIds = new Set(bundles.map((b) => b.productId));
  const seriesProducts = products.filter((p) => bundleProductIds.has(p.id));
  const seriesColors = seriesProductId ? colorsOf(variants, seriesProductId) : [];
  const seriesBundles = bundles.filter((b) => b.productId === seriesProductId);

  /**
   * يوسّع السيريه المختارة إلى سطور: لكل مقاس في الطقم متغيّرٌ (منتج×لون×مقاس)
   * بكمية = كمية المقاس × عدد الأطقم. المقاسات التي لا متغيّر لها بهذا اللون
   * تُتجاهل ويُنبَّه عليها — لا نخترع متغيّراً غير موجود.
   */
  function addSeries() {
    const bundle = bundles.find((b) => b.id === seriesBundleId);
    if (!bundle || !seriesColorId) {
      setSeriesMsg('اختر المنتج واللون والسيريه أولاً.');
      return;
    }
    const count = Math.max(1, Math.round(seriesCount) || 1);
    // سعر قطعة السيريه = سعر الدست ÷ إجمالي قطع السيريه (إن حُدّد سعر لها).
    const bundlePieces = bundle.lines.reduce((s, l) => s + l.quantity, 0);
    const seriesPiecePrice =
      bundle.price != null && bundlePieces > 0 ? bundle.price / bundlePieces : null;
    const added: DocLine[] = [];
    const missing: string[] = [];
    for (const bl of bundle.lines) {
      const variant = resolveVariant(variants, bundle.productId, seriesColorId, bl.sizeId);
      if (!variant) {
        missing.push(bl.sizeCode);
        continue;
      }
      const services = servicesOf(variant);
      const base: DocLine = {
        productId: bundle.productId,
        colorId: seriesColorId,
        sizeId: bl.sizeId,
        variantId: variant.value,
        service: services[0] ?? '',
        quantity: bl.quantity * count,
        unitPrice: 0,
        discountAmount: 0,
        taxRate: 0,
        notes: '',
      };
      // سعر السيريه يفوز إن وُجد؛ وإلا نستعمل تسعير القطعة/الشرائح المعتاد.
      added.push(seriesPiecePrice != null ? { ...base, unitPrice: seriesPiecePrice } : reprice(base));
    }
    if (added.length === 0) {
      setSeriesMsg('لا يوجد متغيّر لأي مقاس في هذه السيريه باللون المختار — أنشئ المتغيّرات أولاً.');
      return;
    }
    setLines((prev) => {
      // استبدل السطر الافتراضي الفارغ الوحيد بدل تركه فوق السيريه.
      const base = prev.length === 1 && !prev[0].variantId ? [] : prev;
      return [...base, ...added];
    });
    const seriesName = `${bundle.nameAr}${count > 1 ? ` ×${count}` : ''}`;
    setSeriesMsg(
      missing.length
        ? `أُضيفت «${seriesName}». المقاسات ${missing.join('، ')} بلا متغيّر بهذا اللون — تُجوهلت.`
        : `أُضيفت «${seriesName}» — ${added.length} سطر.`,
    );
  }

  /**
   * يعيد تسعير السطر من شريحة الخدمة والكمية — هذا هو الحساب الصحيح.
   *
   * سعر المتغيّر الثابت غالباً فارغ، والسعر الحقيقي في شرائح (خدمة، كمية).
   * فمتى تغيّر المتغيّر أو الخدمة أو الكمية أعدنا ملء سعر الوحدة من الشريحة
   * المطابقة. إن لم تطابق شريحة استعملنا السعر الثابت إن وُجد، وإلا تركنا ما
   * أدخله المستخدم يدوياً — لا نخترع صفراً.
   */
  function reprice(line: DocLine): DocLine {
    const v = variants.find((x) => x.value === line.variantId);
    if (!v) return line;
    if (line.service) {
      const tier = applicableTier(v.tiers, {
        service: line.service,
        quantity: line.quantity,
        variantId: line.variantId,
      });
      if (tier) return { ...line, unitPrice: tier.price };
    }
    if (v.tiers.length === 0 && v.price > 0) return { ...line, unitPrice: v.price };
    return line;
  }

  function update(index: number, patch: Partial<DocLine>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  /** تعديل يُعقبه إعادة تسعير — للخدمة والكمية (لا يغيّر الاختيار). */
  function updatePriced(index: number, patch: Partial<DocLine>) {
    setLines((prev) => prev.map((l, i) => (i === index ? reprice({ ...l, ...patch }) : l)));
  }

  /**
   * اختيار متسلسل: المنتج ثم اللون ثم المقاس. كلٌّ يصفّر ما تحته، ويُختار
   * تلقائياً حين لا بديل (لون واحد أو مقاس واحد)، ثم يُحلّ المتغيّر وتُختار
   * الخدمة الافتراضية ويُعاد التسعير — فالسعر يظهر بمجرد اكتمال الاختيار.
   */
  function chooseInLine(index: number, patch: { productId?: string; colorId?: string; sizeId?: string }) {
    setLines((prev) =>
      prev.map((l, i) => {
        if (i !== index) return l;
        const next = { ...l, ...patch };
        if (patch.productId !== undefined) {
          next.colorId = '';
          next.sizeId = '';
          const colors = colorsOf(variants, next.productId);
          if (colors.length === 1) next.colorId = colors[0].id;
        }
        if (patch.colorId !== undefined) next.sizeId = '';
        const sizes = sizesOf(variants, next.productId, next.colorId);
        if (sizes.length === 1) next.sizeId = sizes[0].id;

        const resolved = resolveVariant(variants, next.productId, next.colorId, next.sizeId);
        next.variantId = resolved?.value ?? '';
        const services = resolved ? servicesOf(resolved) : [];
        next.service = services.includes(next.service) ? next.service : services[0] ?? '';
        return reprice(next);
      }),
    );
  }

  const computed = lines
    .filter((l) => l.variantId && l.quantity > 0)
    .map((l) => calcLine(l));
  const totals = calcDocument(computed, {
    discountAmount: docDiscount,
    discountPercent: docDiscountPct,
  });

  const hasDiscount = !totals.discountAmount.eq(0);
  const hasTax = !totals.taxAmount.eq(0);

  return (
    <form action={formAction} className="space-y-6" noValidate>
      {webOrderId && <input type="hidden" name="webOrderId" value={webOrderId} />}
      <FormError message={state.error} />
      {state.ok && (
        <p role="status" className="rounded-lg border border-ok bg-ok-soft px-4 py-2.5 text-xs text-ok">
          {state.ok}
        </p>
      )}

      {/* ١. العميل. خطوة واحدة واضحة أعلى الصفحة. */}
      <Select
        name="customerId"
        label="العميل"
        required
        options={customers}
        placeholder="اختر العميل"
        defaultValue={values?.customerId}
        errors={state.fieldErrors}
      />

      {/* ١.٥ السيريه/الطقم — إضافة توزيع مقاسات دفعة واحدة. يظهر فقط حين توجد
          سيريات معرّفة. لا يمنع الإدخال اليدوي؛ يضيف سطوره فوقه. */}
      {seriesProducts.length > 0 && (
        <section className="rounded-xl border border-brand/30 bg-brand/5 p-4">
          <h3 className="mb-3 text-sm font-semibold text-brand">إضافة سيريه / طقم</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block">
              <span className="mb-1.5 block text-xs text-txt-2">المنتج</span>
              <select
                value={seriesProductId}
                onChange={(e) => {
                  const pid = e.target.value;
                  setSeriesProductId(pid);
                  const colors = colorsOf(variants, pid);
                  setSeriesColorId(colors.length === 1 ? colors[0].id : '');
                  const bs = bundles.filter((b) => b.productId === pid);
                  setSeriesBundleId(bs.length === 1 ? bs[0].id : '');
                  setSeriesMsg(null);
                }}
                className="erp-input py-2.5"
              >
                <option value="">اختر…</option>
                {seriesProducts.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs text-txt-2">اللون</span>
              <select
                value={seriesColorId}
                onChange={(e) => setSeriesColorId(e.target.value)}
                disabled={seriesColors.length === 0}
                className="erp-input py-2.5 disabled:opacity-50"
              >
                <option value="">{seriesColors.length ? 'اختر…' : '—'}</option>
                {seriesColors.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs text-txt-2">السيريه</span>
              <select
                value={seriesBundleId}
                onChange={(e) => setSeriesBundleId(e.target.value)}
                disabled={seriesBundles.length === 0}
                className="erp-input py-2.5 disabled:opacity-50"
              >
                <option value="">{seriesBundles.length ? 'اختر…' : '—'}</option>
                {seriesBundles.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nameAr} ({b.lines.reduce((s, l) => s + l.quantity, 0)} قطعة)
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-end gap-2">
              <label className="block flex-1">
                <span className="mb-1.5 block text-xs text-txt-2">عدد الأطقم</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  dir="ltr"
                  value={seriesCount}
                  onChange={(e) => setSeriesCount(Math.max(1, Math.round(Number(e.target.value) || 1)))}
                  className="erp-input py-2.5 text-start"
                />
              </label>
              <button
                type="button"
                onClick={addSeries}
                disabled={!seriesBundleId || !seriesColorId}
                className="h-[42px] shrink-0 rounded-lg bg-brand px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                أضف
              </button>
            </div>
          </div>
          {seriesBundleId && (
            <p className="mt-2 text-[0.7rem] text-txt-3">
              {seriesBundles
                .find((b) => b.id === seriesBundleId)
                ?.lines.map((l) => `${l.quantity * Math.max(1, seriesCount)}× ${l.sizeCode}`)
                .join(' · ')}
            </p>
          )}
          {seriesMsg && <p className="mt-2 text-[0.7rem] font-medium text-brand">{seriesMsg}</p>}
        </section>
      )}

      {/* ٢. البنود — لكل بند: المنتج، الخدمة، الكمية، والسعر يظهر محسوباً.
          لا خصم ولا ضريبة ولا سعر وحدة في كل صف: أُزيلت من الواجهة وتُرسل
          أصفاراً، فالصف صار ثلاث خانات فقط. السعر يُملأ تلقائياً، ولا يظهر
          حقل سعر إلا حين لا توجد شريحة تغطّي الكمية. */}
      <section>
        <h3 className="mb-3 text-sm font-semibold text-brand">الأصناف</h3>

        <div className="space-y-3">
          {lines.map((line, index) => {
            const t = calcLine(line);
            const variant =
              resolveVariant(variants, line.productId, line.colorId, line.sizeId) ??
              variants.find((v) => v.value === line.variantId);
            const colors = colorsOf(variants, line.productId);
            const sizes = sizesOf(variants, line.productId, line.colorId);
            const short = variant && line.quantity > variant.available;
            const services = variant ? servicesOf(variant) : [];
            // هل تغطّي شريحةٌ هذه الكمية والخدمة؟
            const priceGap =
              variant &&
              line.service &&
              !applicableTier(variant.tiers, {
                service: line.service,
                quantity: line.quantity,
                variantId: variant.value,
              });

            return (
              <div key={index} className="rounded-xl border border-line bg-card-2 p-4">
                <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_0.8fr_1fr_0.7fr_auto]">
                  <label className="block">
                    <span className="mb-1.5 block text-xs text-txt-2">المنتج</span>
                    <select
                      value={line.productId}
                      onChange={(e) => chooseInLine(index, { productId: e.target.value })}
                      className="erp-input py-2.5"
                    >
                      <option value="">اختر المنتج…</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>{p.label}</option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-xs text-txt-2">اللون</span>
                    <select
                      value={line.colorId}
                      onChange={(e) => chooseInLine(index, { colorId: e.target.value })}
                      disabled={colors.length === 0}
                      className="erp-input py-2.5 disabled:opacity-50"
                    >
                      <option value="">{colors.length ? 'اختر اللون…' : '—'}</option>
                      {colors.map((c) => (
                        <option key={c.id} value={c.id}>{c.label}</option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-xs text-txt-2">المقاس</span>
                    <select
                      value={line.sizeId}
                      onChange={(e) => chooseInLine(index, { sizeId: e.target.value })}
                      disabled={sizes.length === 0}
                      className="erp-input py-2.5 disabled:opacity-50"
                    >
                      <option value="">{sizes.length ? 'اختر المقاس…' : '—'}</option>
                      {sizes.map((s) => (
                        <option key={s.id} value={s.id}>{s.label}</option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-xs text-txt-2">الخدمة</span>
                    <select
                      value={line.service}
                      onChange={(e) => updatePriced(index, { service: e.target.value })}
                      disabled={services.length === 0}
                      className="erp-input py-2.5 disabled:opacity-50"
                    >
                      {services.length === 0 && <option value="">—</option>}
                      {services.map((s) => (
                        <option key={s} value={s}>
                          {PRICE_SERVICE_AR[s as PriceService] ?? s}
                        </option>
                      ))}
                    </select>
                  </label>

                  <NumberCell
                    label="الكمية"
                    name="lineQuantity"
                    value={line.quantity}
                    onChange={(v) => updatePriced(index, { quantity: v })}
                    integer
                  />

                  <button
                    type="button"
                    onClick={() => setLines((p) => (p.length > 1 ? p.filter((_, i) => i !== index) : p))}
                    disabled={lines.length === 1}
                    className="grid h-[42px] w-10 place-items-center rounded-lg border border-line text-txt-3 transition-colors hover:border-bad hover:text-bad disabled:opacity-30"
                    aria-label="حذف الصنف"
                    title="حذف الصنف"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* المتغيّر المحلول يُرسل للخادم؛ والخصم والضريبة صفر، والملاحظة فارغة. */}
                <input type="hidden" name="lineVariantId" value={line.variantId} />
                <input type="hidden" name="lineDiscount" value={0} />
                <input type="hidden" name="lineTaxRate" value={0} />
                <input type="hidden" name="lineNotes" value={line.notes} />

                {/* السطر السفلي: سعر الوحدة (يُملأ تلقائياً وقابل للتعديل) والإجمالي. */}
                <div className="mt-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-t border-line/60 pt-3">
                  <div className="w-32">
                    <NumberCell
                      label="سعر الوحدة"
                      name="lineUnitPrice"
                      value={line.unitPrice}
                      onChange={(v) => update(index, { unitPrice: v })}
                    />
                  </div>
                  <div className="text-end text-sm">
                    {variant && short && (
                      <span className="block text-xs text-bad">المتاح {variant.available} فقط</span>
                    )}
                    <span className="text-xs text-txt-3">الإجمالي </span>
                    <span className="tnum font-semibold text-txt">{formatMoney(t.lineTotal)}</span>
                  </div>
                </div>

                {priceGap && (
                  <p className="mt-1.5 text-[0.7rem] text-warn">
                    لا توجد شريحة سعر جاهزة لهذه الكمية — السعر معروض للتعديل يدوياً.
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setLines((p) => [...p, emptyLine()])}
          className="mt-3 w-full rounded-xl border border-dashed border-line py-3 text-sm font-medium text-txt-2 transition-colors hover:border-brand hover:text-brand"
        >
          + إضافة صنف آخر
        </button>
      </section>

      {/* ٣. الإجمالي — كبير وواضح. */}
      <div className="flex items-center justify-between rounded-xl border border-line bg-card-2 px-5 py-4">
        <span className="text-sm text-txt-2">الإجمالي</span>
        <span className="tnum text-2xl font-bold text-brand">{formatMoney(totals.total)}</span>
      </div>
      {(hasDiscount || hasTax) && (
        <p className="-mt-3 flex flex-wrap justify-end gap-x-4 text-xs text-txt-3">
          <span>المجموع <span className="tnum">{formatMoney(totals.subtotal)}</span></span>
          {hasDiscount && <span>الخصم <span className="tnum">-{formatMoney(totals.discountAmount)}</span></span>}
          {hasTax && <span>الضريبة <span className="tnum">{formatMoney(totals.taxAmount)}</span></span>}
        </p>
      )}

      {/* ٣.٥ إصدار وتحصيل فوري — للفاتورة المباشرة فقط. العميل الذي يدفع في
          الحال يخرج بفاتورة مُصدَرة ومُحصَّلة بضغطة، بلا خطوتَي إصدار وتحصيل
          منفصلتين. الخادم يُخصّص الرقم المتسلسل ويسجّل الدفعة في معاملة واحدة. */}
      {instantIssue && (
        <section className="rounded-xl border border-line bg-card-2 p-4">
          <label className="flex cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              checked={issueNow}
              onChange={(e) => setIssueNow(e.target.checked)}
              className="h-4 w-4 accent-[var(--color-brand)]"
            />
            <span className="text-sm font-medium text-txt">إصدار وتحصيل فوري</span>
          </label>
          <p className="mt-1.5 text-[0.7rem] leading-[1.8] text-txt-4">
            يُصدر الفاتورة (فيُخصَّص رقمها المتسلسل) ويسجّل الدفعة مباشرة — للعميل الذي
            يدفع في الحال. اتركه فارغاً لحفظها كمسوّدة تُصدَّر لاحقاً.
          </p>
          <input type="hidden" name="issueNow" value={issueNow ? '1' : '0'} />

          {issueNow && (
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1.5 block text-xs text-txt-2">المبلغ المدفوع</span>
                <input
                  name="paymentAmount"
                  type="number"
                  step="0.01"
                  min="0"
                  dir="ltr"
                  value={payAmount}
                  onChange={(e) => setPayAmount(Math.max(0, Number(e.target.value) || 0))}
                  className="erp-input py-2.5 text-start"
                />
                <button
                  type="button"
                  onClick={() => setPayAmount(totals.total.toNumber())}
                  className="mt-1 text-[0.7rem] text-brand hover:underline"
                >
                  المبلغ كامل ({formatMoney(totals.total)})
                </button>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs text-txt-2">طريقة السداد</span>
                <select
                  name="paymentMethod"
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value)}
                  className="erp-input py-2.5"
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {PAYMENT_METHOD_AR[m]}
                    </option>
                  ))}
                </select>
              </label>
              <div className="block">
                <span className="mb-1.5 block text-xs text-txt-2">المتبقّي على العميل</span>
                <div
                  className={`tnum rounded-lg border border-line bg-card px-3 py-2.5 text-sm font-bold ${
                    dec(totals.total).minus(payAmount).lte(0) ? 'text-ok' : 'text-warn'
                  }`}
                >
                  {formatMoney(dec(totals.total).minus(payAmount))}
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ٤. اختياري ومطويّ: خصم وتواريخ وملاحظات — لا يراها من لا يحتاجها. */}
      <details className="rounded-xl border border-line bg-card-2 px-4 py-3">
        <summary className="cursor-pointer select-none text-sm font-medium text-txt-2">
          خيارات إضافية — خصم، تواريخ، ملاحظات
        </summary>
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs text-txt-2">خصم (مبلغ)</span>
              <input
                name="discountAmount"
                type="number"
                step="0.01"
                dir="ltr"
                value={docDiscount}
                onChange={(e) => setDocDiscount(Number(e.target.value) || 0)}
                className="erp-input py-2.5 text-start"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs text-txt-2">خصم %</span>
              <input
                name="discountPercent"
                type="number"
                step="0.01"
                dir="ltr"
                value={docDiscountPct}
                onChange={(e) => setDocDiscountPct(Number(e.target.value) || 0)}
                className="erp-input py-2.5 text-start"
              />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field name={labels.dateA === 'تاريخ الإصدار' ? 'issueDate' : 'orderDate'} label={labels.dateA} type="date" dir="ltr" defaultValue={values?.dateA} />
            <Field name={labels.dateB === 'تاريخ الانتهاء' ? 'expiryDate' : 'requiredDeliveryDate'} label={labels.dateB} type="date" dir="ltr" defaultValue={values?.dateB} />
          </div>
          <TextArea name="notes" label="ملاحظات" defaultValue={values?.notes} rows={3} />
        </div>
      </details>

      <SubmitButton
        label={
          instantIssue && issueNow
            ? payAmount > 0
              ? 'إنشاء وإصدار وتحصيل'
              : 'إنشاء وإصدار'
            : submitLabel
        }
      />
    </form>
  );
}

function NumberCell({
  label,
  name,
  value,
  onChange,
  integer = false,
}: {
  label: string;
  name: string;
  value: number;
  onChange: (v: number) => void;
  /** الكمية بالعدد الصحيح: تزيد ١، ٢، ٣ لا بالكسور. */
  integer?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs text-txt-2">{label}</span>
      <input
        name={name}
        type="number"
        step={integer ? 1 : 0.01}
        min={integer ? 1 : undefined}
        dir="ltr"
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value) || 0;
          onChange(integer ? Math.max(0, Math.round(n)) : n);
        }}
        className="erp-input py-2.5 text-start"
      />
    </label>
  );
}
