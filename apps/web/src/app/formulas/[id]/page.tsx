import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  can,
  formatMoney,
  formatQty,
  FORMULA_KIND_AR,
  FORMULA_VERSION_STATUS_AR,
  COST_CATEGORY_AR,
  COST_BASIS_AR,
  unpricedLines,
} from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader, Table, Badge } from '@/components/crud/Shell';
import type { SearchParams } from '@/lib/query';
import { FormulaForm } from '../FormulaForm';
import { LineForm } from '../LineForm';
import { ParamForm } from '../ParamForm';
import { AssignForm, type ProductOption } from '../AssignForm';
import { PriceEditor } from '../PriceEditor';
import {
  updateFormula,
  deleteFormula,
  publishVersion,
  startNewVersion,
  addLine,
  updateVersionPrices,
  deleteLine,
  setParam,
  deleteParam,
  assignFormula,
  unassignFormula,
} from '../actions';

export const metadata: Metadata = { title: 'المعادلة' };

/** Errors the actions signal by redirect, since they carry no form state. */
const ERRORS: Record<string, string> = {
  assigned: 'لا يمكن حذف معادلة مرتبطة بمنتجات. أزِل الروابط أولاً.',
  empty: 'لا يمكن نشر إصدار بلا بنود — سيجعل تكلفة كل منتج صفراً.',
  'draft-exists': 'يوجد إصدار مسودة مفتوح بالفعل. أكمِله أو انشره أولاً.',
};

export default async function FormulaDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const user = await requirePermission('formula.view');
  const { id } = await params;
  const sp = await searchParams;
  const errKey = Array.isArray(sp.err) ? sp.err[0] : sp.err;

  // The currency label on the price screen: read, never guessed. A manager
  // typing costs must see the unit those numbers are in.
  const company = await prisma.company.findFirst({
    where: { tenantId: user.tenantId },
    select: { currency: true },
  });

  const formula = await prisma.formula.findFirst({
    where: { id, tenantId: user.tenantId, isDeleted: false },
    include: {
      versions: {
        orderBy: { version: 'desc' },
        include: {
          lines: { orderBy: { sequence: 'asc' }, include: { material: { select: { nameAr: true } } } },
          params: { orderBy: { key: 'asc' } },
          publishedBy: { select: { nameAr: true, name: true } },
          _count: { select: { snapshotLines: true } },
        },
      },
      products: {
        include: {
          product: { select: { id: true, sku: true, nameAr: true } },
          variant: { select: { sku: true } },
        },
      },
    },
  });
  if (!formula) notFound();

  const canWrite = can(user.role, 'formula.write');
  const draft = formula.versions.find((v) => v.status === 'DRAFT');
  const current = formula.versions.find((v) => v.id === formula.currentVersionId);
  // The draft is what you edit; if there is none, the published version is
  // shown read-only. Never both — two editable surfaces for one formula is
  // how a "which one is live?" bug starts.
  const shown = draft ?? current ?? formula.versions[0];

  const [materials, products] = canWrite
    ? await Promise.all([
        prisma.material.findMany({
          where: { tenantId: user.tenantId, isDeleted: false },
          orderBy: { nameAr: 'asc' },
          select: { id: true, nameAr: true },
        }),
        prisma.product.findMany({
          where: { tenantId: user.tenantId, isDeleted: false, status: 'ACTIVE' },
          orderBy: { sku: 'asc' },
          select: {
            id: true,
            sku: true,
            nameAr: true,
            variants: {
              where: { isDeleted: false },
              select: {
                id: true,
                sku: true,
                color: { select: { nameAr: true } },
                size: { select: { code: true } },
              },
              orderBy: { sku: 'asc' },
            },
          },
        }),
      ])
    : [[], []];

  const productOptions: ProductOption[] = products.map((p) => ({
    value: p.id,
    label: `${p.nameAr} (${p.sku})`,
    variants: p.variants.map((v) => ({
      value: v.id,
      label: [v.color?.nameAr, v.size?.code].filter(Boolean).join(' · ') || v.sku,
    })),
  }));

  return (
    <AppShell user={user} title={`${formula.code} — ${formula.nameAr}`}>
      <ModuleHeader
        title={formula.nameAr}
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/formulas" className="erp-btn-ghost">
              رجوع
            </Link>
            {canWrite && !draft && (
              <form action={startNewVersion.bind(null, formula.id)}>
                <button type="submit" className="erp-btn">
                  بدء إصدار جديد
                </button>
              </form>
            )}
            {canWrite && draft && (
              <form action={publishVersion.bind(null, draft.id)}>
                <button type="submit" className="erp-btn">
                  نشر الإصدار {draft.version}
                </button>
              </form>
            )}
            {canWrite && formula.products.length === 0 && (
              <form action={deleteFormula.bind(null, formula.id)}>
                <button type="submit" className="erp-btn-ghost">
                  حذف
                </button>
              </form>
            )}
          </div>
        }
      />

      {errKey && ERRORS[errKey] && (
        <p
          role="alert"
          className="mb-5 rounded-lg border border-bad bg-bad-soft px-4 py-3 text-xs text-bad"
        >
          {ERRORS[errKey]}
        </p>
      )}

      {shown && unpricedLines(shown.lines).length > 0 && (
        <p
          role="alert"
          className="mb-5 rounded-lg border border-warn bg-warn-soft px-4 py-3 text-xs text-warn"
        >
          {unpricedLines(shown.lines).length} من البنود بلا سعر وحدة. الاستهلاك مضبوط،
          لكن التكلفة الناتجة ستكون أقل من الحقيقة — أدخِل الأسعار قبل استخدام هذه
          المعادلة في أي تسعير:{' '}
          <span className="font-medium">
            {unpricedLines(shown.lines)
              .map((l) => l.nameAr)
              .join(' · ')}
          </span>
        </p>
      )}

      <div className="mb-6 flex flex-wrap items-center gap-4 text-xs text-txt-3">
        <span dir="ltr" className="tnum font-medium text-txt">
          {formula.code}
        </span>
        <span>{(FORMULA_KIND_AR as Record<string, string>)[formula.kind] ?? formula.kind}</span>
        {current ? (
          <Badge tone="ok">المنشور: إصدار {current.version}</Badge>
        ) : (
          <Badge tone="muted">لا يوجد إصدار منشور — لا تُحسب به تكلفة</Badge>
        )}
        {draft && <Badge tone="muted">مسودة مفتوحة: إصدار {draft.version}</Badge>}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          {shown && (
            <section>
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold text-brand">
                  بنود التكلفة — إصدار {shown.version}
                </h3>
                <span className="text-[0.7rem] text-txt-4">
                  {(FORMULA_VERSION_STATUS_AR as Record<string, string>)[shown.status]}
                  {shown.status !== 'DRAFT' && ' · للقراءة فقط'}
                </span>
              </div>

              <Table
                headers={['#', 'البند', 'الوصف', 'الأساس', 'الكمية', 'الوحدة', 'تكلفة الوحدة', '']}
                empty={shown.lines.length === 0}
              >
                {shown.lines.map((line) => (
                  <tr key={line.id}>
                    <td className="tnum px-4 py-3 text-txt-4">{line.sequence}</td>
                    <td className="px-4 py-3 text-txt-2">
                      {(COST_CATEGORY_AR as Record<string, string>)[line.category] ?? line.category}
                    </td>
                    <td className="px-4 py-3 text-txt">
                      {line.nameAr}
                      {line.material && (
                        <span className="ms-2 text-[0.7rem] text-txt-4">{line.material.nameAr}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[0.7rem] text-txt-3">
                      {(COST_BASIS_AR as Record<string, string>)[line.basis] ?? line.basis}
                    </td>
                    <td className="tnum px-4 py-3 text-txt-2">
                      {line.basis === 'PERCENT_OF_DIRECT'
                        ? `${formatQty(line.quantity)}٪`
                        : formatQty(line.quantity)}
                      {line.yieldQty && (
                        <span className="text-[0.7rem] text-txt-4">
                          {' '}
                          / {formatQty(line.yieldQty)} قطعة
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-txt-3">{line.unit ?? '—'}</td>
                    <td className="tnum px-4 py-3 text-txt-2">
                      {line.basis === 'PERCENT_OF_DIRECT' ? '—' : formatMoney(line.unitCost)}
                    </td>
                    <td className="px-4 py-3 text-end">
                      {canWrite && shown.status === 'DRAFT' && (
                        <form action={deleteLine.bind(null, formula.id, line.id)}>
                          <button type="submit" className="text-[0.7rem] text-bad hover:underline">
                            حذف
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </Table>

              {canWrite && shown.status === 'DRAFT' && (
                <>
                  {/* Prices first: this is the screen the whole cost engine
                      was waiting on, so it comes before the add-a-line form. */}
                  <div className="mt-6">
                    <h4 className="mb-3 text-sm font-semibold text-brand">أسعار الوحدات</h4>
                    <PriceEditor
                      action={updateVersionPrices.bind(null, formula.id, shown.id)}
                      currency={company?.currency ?? 'EGP'}
                      rows={shown.lines.map((l) => ({
                        id: l.id,
                        sequence: l.sequence,
                        category: l.category,
                        nameAr: l.nameAr,
                        basis: l.basis,
                        unit: l.unit,
                        // Decimal does not cross to a client component.
                        quantity: l.quantity.toString(),
                        yieldQty: l.yieldQty ? l.yieldQty.toString() : null,
                        unitCost: l.unitCost.toString(),
                      }))}
                    />
                  </div>

                  <div className="erp-card mt-6 p-5">
                    <h4 className="mb-4 text-xs font-semibold text-brand">إضافة بند</h4>
                    <LineForm
                      action={addLine.bind(null, shown.id)}
                      materials={materials.map((m) => ({ value: m.id, label: m.nameAr }))}
                    />
                  </div>
                </>
              )}
            </section>
          )}

          {shown && (
            <section>
              <h3 className="mb-3 text-sm font-semibold text-brand">
                معاملات الإصدار {shown.version}
              </h3>
              <Table
                headers={['المفتاح', 'الاسم', 'القيمة', 'الوحدة', '']}
                empty={shown.params.length === 0}
              >
                {shown.params.map((p) => (
                  <tr key={p.id}>
                    <td dir="ltr" className="px-4 py-3 text-start text-txt-2">
                      {p.key}
                    </td>
                    <td className="px-4 py-3 text-txt">{p.nameAr}</td>
                    <td className="tnum px-4 py-3 text-txt-2">{formatQty(p.value)}</td>
                    <td className="px-4 py-3 text-txt-3">{p.unit ?? '—'}</td>
                    <td className="px-4 py-3 text-end">
                      {canWrite && shown.status === 'DRAFT' && (
                        <form action={deleteParam.bind(null, formula.id, p.id)}>
                          <button type="submit" className="text-[0.7rem] text-bad hover:underline">
                            حذف
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </Table>

              {canWrite && shown.status === 'DRAFT' && (
                <div className="erp-card mt-4 p-5">
                  <h4 className="mb-4 text-xs font-semibold text-brand">إضافة أو تعديل معامل</h4>
                  <ParamForm action={setParam.bind(null, shown.id)} />
                </div>
              )}
            </section>
          )}
        </div>

        <aside className="space-y-6">
          <section className="erp-card p-5">
            <h3 className="mb-3 text-sm font-semibold text-brand">الإصدارات</h3>
            <ul className="space-y-2 text-sm">
              {formula.versions.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-3">
                  <span className="text-txt-2">
                    إصدار {v.version}
                    {v.id === formula.currentVersionId && (
                      <span className="ms-2 text-[0.7rem] text-ok">المنشور</span>
                    )}
                  </span>
                  <span className="text-[0.7rem] text-txt-4">
                    {(FORMULA_VERSION_STATUS_AR as Record<string, string>)[v.status]}
                    {v._count.snapshotLines > 0 && ` · مستخدم في ${v._count.snapshotLines} بند محفوظ`}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[0.7rem] text-txt-4">
              الإصدار المنشور لا يُعدَّل أبداً. التعديل يُنشئ الإصدار التالي، فتبقى كل تكلفة
              حُسبت سابقاً كما هي بالضبط.
            </p>
          </section>

          <section className="erp-card p-5">
            <h3 className="mb-3 text-sm font-semibold text-brand">المنتجات المرتبطة</h3>
            {formula.products.length === 0 ? (
              <p className="text-[0.7rem] text-txt-4">
                غير مرتبطة بأي منتج — لن تدخل في حساب أي تكلفة.
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {formula.products.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3">
                    <Link href={`/products/${a.product.id}`} className="text-txt-2 hover:text-brand">
                      {a.product.nameAr}
                      <span className="ms-2 text-[0.7rem] text-txt-4">
                        {a.variant ? a.variant.sku : 'كل المتغيّرات'}
                      </span>
                    </Link>
                    {canWrite && (
                      <form action={unassignFormula.bind(null, formula.id, a.id)}>
                        <button type="submit" className="text-[0.7rem] text-bad hover:underline">
                          إزالة
                        </button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {canWrite && (
              <div className="mt-5 border-t border-line pt-5">
                <AssignForm action={assignFormula.bind(null, formula.id)} products={productOptions} />
              </div>
            )}
          </section>

          {canWrite && (
            <section className="erp-card p-5">
              <h3 className="mb-4 text-sm font-semibold text-brand">بيانات المعادلة</h3>
              <FormulaForm
                action={updateFormula.bind(null, formula.id)}
                defaults={{ nameAr: formula.nameAr, kind: formula.kind, notes: formula.notes }}
                submitLabel="حفظ"
              />
            </section>
          )}
        </aside>
      </div>
    </AppShell>
  );
}
