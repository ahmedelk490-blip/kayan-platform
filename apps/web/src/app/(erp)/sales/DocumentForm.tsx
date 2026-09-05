'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
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
import { Field, TextArea, SubmitButton, FormError } from '@/components/crud/Form';
import { SearchableSelect } from '@/components/crud/SearchableSelect';
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
  /** سعر التوصيل الحالي (للتعديل) — يُملأ من بند 🚚 أو مصروف الشحن المسجَّل. */
  deliveryFee?: number;
  deliveryOn?: 'CUSTOMER' | 'US';
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
  sources,
  allowNewCustomer = false,
  lastPriceAction,
  debts,
  withDelivery = false,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  customers: { value: string; label: string }[];
  variants: VariantOption[];
  values?: DocValues;
  labels: { dateA: string; dateB: string };
  submitLabel?: string;
  /** مصادر الطلب المتاحة (ماسنجر/انستا/…) — تظهر خانة «مصدر الطلب» إن مُرِّرت. */
  sources?: { value: string; label: string }[];
  /** يُتيح «إصدار وتحصيل فوري» — خاص بالفاتورة المباشرة فقط. */
  instantIssue?: boolean;
  /** يبدأ «إصدار وتحصيل فوري» مفعّلاً — للوحة الكاشير. */
  instantDefault?: boolean;
  /** السيريات/الأطقم المتاحة — لإضافة توزيع مقاسات دفعة واحدة. */
  bundles?: BundleOption[];
  /** طلب موقع مصدر هذه الفاتورة — يُوسَم «تحوّل» عند الإنشاء. */
  webOrderId?: string;
  /** يُظهر «+ عميل جديد» داخل الفورم (اسم وهاتف) بدل مغادرة الفاتورة. */
  allowNewCustomer?: boolean;
  /** يجلب آخر سعر بيع (عميل × متغيّر) ليظهر تلميحاً تحت خانة السعر. */
  lastPriceAction?: (customerId: string, variantId: string) => Promise<{ price: number; date: string } | null>;
  /** دين كل عميل المفتوح — يظهر تحذيراً لحظة اختياره. */
  debts?: Record<string, { amount: number; count: number }>;
  /** يُظهر خانة «🚚 سعر التوصيل» — للفواتير فقط (الطلبات وعروض السعر تشترط منتجاً لكل بند). */
  withDelivery?: boolean;
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

  // سعر التوصيل: على الزبون (بند يرفع الإجمالي) أو علينا (مصروف يُخصم من الربح).
  const [deliveryFee, setDeliveryFee] = useState(values?.deliveryFee ?? 0);
  const [deliveryOn, setDeliveryOn] = useState<'CUSTOMER' | 'US'>(values?.deliveryOn ?? 'CUSTOMER');

  // «+ عميل جديد» داخل الفورم: اسم وهاتف بدل مغادرة الفاتورة والرجوع.
  const [newCustomer, setNewCustomer] = useState(false);

  // آخر سعر (عميل × متغيّر): يُجلب عند اكتمال الاختيار ويُعرض تلميحاً.
  const [customerId, setCustomerId] = useState(values?.customerId ?? '');
  const [lastPrices, setLastPrices] = useState<Record<string, { price: number; date: string }>>({});
  const fetchedPrices = useRef(new Set<string>());
  useEffect(() => {
    if (!lastPriceAction || !customerId || newCustomer) return;
    for (const vid of new Set(lines.map((l) => l.variantId).filter(Boolean))) {
      const key = `${customerId}:${vid}`;
      if (fetchedPrices.current.has(key)) continue;
      fetchedPrices.current.add(key);
      lastPriceAction(customerId, vid).then((res) => {
        if (res) setLastPrices((p) => ({ ...p, [key]: res }));
      });
    }
  }, [customerId, lines, lastPriceAction, newCustomer]);

  // إضافة بالمقاسات: منتج ← لون ← كمية لكل مقاس ← أضف — كما في الكاشير.
  // كان إدخال المقاسات سطراً سطراً (منتج/لون/مقاس لكل سطر) وهو أبطأ ما في
  // الفورم؛ الآن توزيعة كاملة (2×L و3×XL…) تدخل دفعة واحدة.
  const [szProductId, setSzProductId] = useState('');
  const [szColorId, setSzColorId] = useState('');
  const [szQty, setSzQty] = useState<Record<string, number>>({});
  const [szMsg, setSzMsg] = useState<string | null>(null);
  const szColors = szProductId ? colorsOf(variants, szProductId) : [];
  const szSizes = szProductId ? sizesOf(variants, szProductId, szColorId) : [];

  function addBySizes() {
    const makeLine = (sizeId: string, qty: number): DocLine | null => {
      const v = resolveVariant(variants, szProductId, szColorId, sizeId);
      if (!v) return null;
      const services = servicesOf(v);
      const line: DocLine = {
        productId: szProductId,
        colorId: szColorId,
        sizeId,
        variantId: v.value,
        service: services[0] ?? '',
        quantity: qty,
        unitPrice: 0,
        discountAmount: 0,
        taxRate: 0,
        notes: '',
      };
      // السعر المقترح يملأ الخانة توفيراً للكتابة — ويبقى قابلاً للتعديل بيد البائع.
      line.unitPrice = suggestedPrice(line) ?? 0;
      return line;
    };

    const added: DocLine[] = [];
    if (szSizes.length === 0) {
      const qty = szQty['__base'] || 0;
      if (qty <= 0) {
        setSzMsg('حدّد كمية أولاً.');
        return;
      }
      const line = makeLine('', qty);
      if (!line) {
        setSzMsg('اختر اللون أولاً — لا متغيّر مطابق.');
        return;
      }
      added.push(line);
    } else {
      for (const s of szSizes) {
        const qty = szQty[s.id] || 0;
        if (qty <= 0) continue;
        const line = makeLine(s.id, qty);
        if (line) added.push(line);
      }
      if (added.length === 0) {
        setSzMsg('حدّد كمية لمقاس واحد على الأقل.');
        return;
      }
    }

    setLines((prev) => {
      const base = prev.length === 1 && !prev[0].variantId ? [] : prev;
      return [...base, ...added];
    });
    setSzQty({});
    setSzMsg(`أُضيف ${added.length} سطر — ${added.reduce((s, l) => s + l.quantity, 0)} قطعة.`);
  }

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
      // سعر السيريه يفوز إن وُجد؛ وإلا يبقى السعر فارغاً ليكتبه البائع بيده.
      added.push(seriesPiecePrice != null ? { ...base, unitPrice: seriesPiecePrice } : base);
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
   * السعر المقترح من شرائح الخدمة والكمية، أو السعر الثابت إن وُجد.
   *
   * سعر الوحدة بيد البائع دائماً (بطلب المالك): النظام لا يملأ الحقل ولا
   * يغيّره تلقائياً — يعرض المقترح تلميحاً تحته، وضغطةٌ عليه تطبّقه.
   */
  function suggestedPrice(line: DocLine): number | null {
    const v = variants.find((x) => x.value === line.variantId);
    if (!v) return null;
    if (line.service) {
      const tier = applicableTier(v.tiers, {
        service: line.service,
        quantity: line.quantity,
        variantId: line.variantId,
      });
      if (tier) return tier.price;
    }
    if (v.price > 0) return v.price;
    return null;
  }

  function update(index: number, patch: Partial<DocLine>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  /**
   * اختيار متسلسل: المنتج ثم اللون ثم المقاس. كلٌّ يصفّر ما تحته، ويُختار
   * تلقائياً حين لا بديل (لون واحد أو مقاس واحد)، ثم يُحلّ المتغيّر وتُختار
   * الخدمة الافتراضية — والسعر يبقى بيد البائع، لا يُملأ تلقائياً.
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
        return next;
      }),
    );
  }

  const computed = lines
    .filter((l) => l.variantId && l.quantity > 0)
    .map((l) => calcLine(l));
  // توصيل «على الزبون» يدخل الحسبة كسطر — نفس ما سيحسبه الخادم تماماً.
  if (withDelivery && deliveryOn === 'CUSTOMER' && deliveryFee > 0) {
    computed.push(calcLine({ quantity: 1, unitPrice: deliveryFee, discountAmount: 0, taxRate: 0 }));
  }
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

      {/* ١. العميل — قائمة قابلة للبحث، أو «+ عميل جديد» (اسم وهاتف) في مكانه. */}
      <div className="block">
        <span className="mb-1.5 flex items-center justify-between text-xs text-txt-2">
          <span>العميل</span>
          {allowNewCustomer && (
            <button
              type="button"
              onClick={() => setNewCustomer((v) => !v)}
              className="text-[0.7rem] font-medium text-brand hover:underline"
            >
              {newCustomer ? '← اختيار عميل موجود' : '+ عميل جديد'}
            </button>
          )}
        </span>
        {newCustomer ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              name="newCustomerName"
              required
              placeholder="اسم العميل الجديد"
              className="erp-input py-2.5"
            />
            <input
              name="newCustomerPhone"
              required
              dir="ltr"
              inputMode="tel"
              placeholder="رقم الهاتف (يمنع التكرار)"
              className="erp-input py-2.5 text-start"
            />
          </div>
        ) : (
          <SearchableSelect
            name="customerId"
            options={customers}
            placeholder="ابحث عن العميل أو اختره…"
            defaultValue={values?.customerId}
            required
            onSelect={setCustomerId}
          />
        )}
        {state.fieldErrors?.customerId && (
          <span className="mt-1 block text-[0.7rem] text-bad">{state.fieldErrors.customerId}</span>
        )}
        {/* دين العميل يواجه البائع لحظة الاختيار — يقرر بالبيع الآجل وهو شايف. */}
        {!newCustomer && customerId && debts?.[customerId] && (
          <span className="mt-1.5 block rounded-lg border border-warn bg-warn-soft px-3 py-1.5 text-[0.7rem] font-medium text-warn">
            ⚠ عليه {formatMoney(dec(debts[customerId].amount))} د.ع من {debts[customerId].count}{' '}
            {debts[customerId].count === 1 ? 'فاتورة مفتوحة' : 'فواتير مفتوحة'}
          </span>
        )}
      </div>

      {/* مصدر الطلب — كل المصادر ظاهرة كأزرار جنب بعض، ضغطة واحدة تختار. */}
      {sources && sources.length > 0 && (
        <fieldset>
          <legend className="mb-2 text-xs text-txt-2">مصدر الطلب</legend>
          <div className="flex flex-wrap gap-2">
            {sources.map((s) => (
              <label
                key={s.value}
                className="cursor-pointer rounded-full border border-line-2 px-4 py-2 text-xs font-medium text-txt-2 transition-colors has-[:checked]:border-brand has-[:checked]:bg-brand-soft has-[:checked]:text-brand"
              >
                <input type="radio" name="source" value={s.value} className="sr-only" />
                {s.label}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {/* ١.٤ إضافة بالمقاسات — منتج ولون ثم كمية لكل مقاس، كما في الكاشير:
          التوزيعة كلها (2×L و3×XL…) تدخل دفعة واحدة بدل سطرٍ لكل مقاس. */}
      {products.length > 0 && (
        <section className="rounded-xl border border-ok/40 bg-ok-soft/40 p-4">
          <h3 className="mb-3 text-sm font-semibold text-ok">إضافة بالمقاسات — كمية لكل مقاس</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs text-txt-2">المنتج</span>
              <select
                value={szProductId}
                onChange={(e) => {
                  const pid = e.target.value;
                  setSzProductId(pid);
                  const colors = colorsOf(variants, pid);
                  setSzColorId(colors.length === 1 ? colors[0].id : '');
                  setSzQty({});
                  setSzMsg(null);
                }}
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
                value={szColorId}
                onChange={(e) => {
                  setSzColorId(e.target.value);
                  setSzQty({});
                }}
                disabled={szColors.length === 0}
                className="erp-input py-2.5 disabled:opacity-50"
              >
                <option value="">{szColors.length ? 'اختر اللون…' : '—'}</option>
                {szColors.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </label>
          </div>

          {szProductId && (szColors.length === 0 || szColorId) && (
            <div className="mt-3">
              <p className="mb-2 text-xs text-txt-3">
                {szSizes.length > 0 ? 'الكمية لكل مقاس' : 'الكمية'}
              </p>
              <div className="flex flex-wrap gap-2">
                {(szSizes.length > 0 ? szSizes : [{ id: '__base', label: 'الكمية' }]).map((s) => {
                  const q = szQty[s.id] || 0;
                  return (
                    <div
                      key={s.id}
                      className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 ${q > 0 ? 'border-ok bg-card' : 'border-line bg-card'}`}
                    >
                      <span className="min-w-8 text-center text-xs font-semibold text-txt">{s.label}</span>
                      <button
                        type="button"
                        aria-label="أنقص"
                        onClick={() => setSzQty((p) => ({ ...p, [s.id]: Math.max(0, (p[s.id] || 0) - 1) }))}
                        className="grid h-9 w-9 place-items-center rounded-md border border-line-2 text-base text-txt-2 active:bg-card-2"
                      >
                        −
                      </button>
                      <span className="tnum min-w-6 text-center text-sm font-medium text-txt">{q}</span>
                      <button
                        type="button"
                        aria-label="زد"
                        onClick={() => setSzQty((p) => ({ ...p, [s.id]: (p[s.id] || 0) + 1 }))}
                        className="grid h-9 w-9 place-items-center rounded-md border border-line-2 text-base text-txt-2 active:bg-card-2"
                      >
                        +
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="tnum text-xs text-txt-3">
                  {Object.values(szQty).reduce((s, n) => s + n, 0)} قطعة محددة
                </span>
                <button
                  type="button"
                  onClick={addBySizes}
                  disabled={Object.values(szQty).every((n) => !n)}
                  className="rounded-lg bg-ok px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  أضف للفاتورة
                </button>
              </div>
            </div>
          )}
          {szMsg && <p className="mt-2 text-[0.7rem] font-medium text-ok">{szMsg}</p>}
        </section>
      )}

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

      {/* ٢. البنود — لكل بند: المنتج واللون والمقاس والخدمة والكمية، وحقل
          تفاصيل حرّ، وسعر الوحدة يكتبه البائع بنفسه (المقترح تلميح فقط).
          الخصم والضريبة أُزيلا من الصف وتُرسل أصفاراً. */}
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
            const suggestion = suggestedPrice(line);
            const lastPrice =
              customerId && line.variantId ? lastPrices[`${customerId}:${line.variantId}`] : undefined;

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
                      onChange={(e) => update(index, { service: e.target.value })}
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
                    onChange={(v) => update(index, { quantity: v })}
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

                {/* المتغيّر المحلول والخدمة يُرسلان للخادم من حقول مخفية دائمة
                    الوجود (select الخدمة قد يُعطَّل فلا يُرسَل)؛ والخصم والضريبة صفر. */}
                <input type="hidden" name="lineVariantId" value={line.variantId} />
                <input type="hidden" name="lineService" value={line.service} />
                <input type="hidden" name="lineDiscount" value={0} />
                <input type="hidden" name="lineTaxRate" value={0} />

                {/* تفاصيل حرّة للصنف: اللون، الطباعة، أي ملاحظة — تُحفظ مع سطر الفاتورة. */}
                <label className="mt-3 block">
                  <span className="mb-1.5 block text-xs text-txt-2">تفاصيل الصنف — اللون، الطباعة، أي ملاحظة</span>
                  <input
                    name="lineNotes"
                    value={line.notes}
                    onChange={(e) => update(index, { notes: e.target.value })}
                    placeholder="مثال: أسود، طباعة شعار على الصدر…"
                    className="erp-input py-2.5"
                  />
                </label>

                {/* السطر السفلي: سعر الوحدة بيد البائع — يكتبه بنفسه، والمقترح تلميح اختياري. */}
                <div className="mt-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-t border-line/60 pt-3">
                  <div className="w-40">
                    <NumberCell
                      label="سعر الوحدة"
                      name="lineUnitPrice"
                      value={line.unitPrice}
                      onChange={(v) => update(index, { unitPrice: v })}
                    />
                    {suggestion != null && suggestion !== line.unitPrice ? (
                      <button
                        type="button"
                        onClick={() => update(index, { unitPrice: suggestion })}
                        className="mt-0.5 block text-[0.65rem] text-brand hover:underline"
                      >
                        المقترح {formatMoney(dec(suggestion))} — اضغط لاعتماده
                      </button>
                    ) : (
                      <span className="mt-0.5 block text-[0.65rem] text-txt-4">السعر بيدك — اكتبه مباشرة</span>
                    )}
                    {lastPrice && lastPrice.price !== line.unitPrice && (
                      <button
                        type="button"
                        onClick={() => update(index, { unitPrice: lastPrice.price })}
                        className="mt-0.5 block text-[0.65rem] text-ok hover:underline"
                        title={lastPrice.date ? `بتاريخ ${lastPrice.date}` : undefined}
                      >
                        آخر سعر لهذا العميل {formatMoney(dec(lastPrice.price))} — اضغط لاعتماده
                      </button>
                    )}
                  </div>
                  <div className="text-end text-sm">
                    {variant && short && (
                      <span className="block text-xs text-bad">المتاح {variant.available} فقط</span>
                    )}
                    <span className="text-xs text-txt-3">الإجمالي </span>
                    <span className="tnum font-semibold text-txt">{formatMoney(t.lineTotal)}</span>
                  </div>
                </div>

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

      {/* ٢.٥ سعر التوصيل — على الزبون (بند يرفع الإجمالي) أو علينا (مصروف
          شحن وتوصيل يُخصم من الربح، والفاتورة لا تتغيّر). اختياري: صفر = بلا. */}
      {withDelivery && (
        <section className="rounded-xl border border-line bg-card-2 p-4">
          <h3 className="mb-3 text-sm font-semibold text-txt">
            🚚 سعر التوصيل <span className="font-normal text-txt-4">(اختياري — اتركه صفراً إن لا توصيل)</span>
          </h3>
          <div className="flex flex-wrap items-center gap-3">
            <input
              name="deliveryFee"
              type="number"
              min="0"
              step="0.01"
              dir="ltr"
              value={deliveryFee}
              onChange={(e) => setDeliveryFee(Math.max(0, Number(e.target.value) || 0))}
              className="erp-input w-36 py-2.5 text-start"
            />
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { value: 'CUSTOMER', label: 'على الزبون' },
                  { value: 'US', label: 'علينا' },
                ] as const
              ).map((o) => (
                <label
                  key={o.value}
                  className="cursor-pointer rounded-full border border-line-2 px-4 py-2 text-xs font-medium text-txt-2 transition-colors has-[:checked]:border-brand has-[:checked]:bg-brand-soft has-[:checked]:text-brand"
                >
                  <input
                    type="radio"
                    name="deliveryOn"
                    value={o.value}
                    checked={deliveryOn === o.value}
                    onChange={() => setDeliveryOn(o.value)}
                    className="sr-only"
                  />
                  {o.label}
                </label>
              ))}
            </div>
          </div>
          {deliveryFee > 0 && (
            <p className="mt-2 text-[0.7rem] leading-[1.8] text-txt-4">
              {deliveryOn === 'CUSTOMER'
                ? `يُضاف بند «🚚 أجور توصيل» بقيمة ${formatMoney(dec(deliveryFee))} على الفاتورة — الزبون يدفعه.`
                : `إجمالي الفاتورة لا يتغيّر — يُسجَّل مصروف «شحن وتوصيل» بقيمة ${formatMoney(dec(deliveryFee))} يُخصم من الربح في التقارير.`}
            </p>
          )}
        </section>
      )}

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
