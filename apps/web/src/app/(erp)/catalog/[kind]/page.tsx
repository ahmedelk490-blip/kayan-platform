import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { can } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader, Table } from '@/components/crud/Shell';
import { CatalogForm } from './CatalogForm';
import { deleteCatalogItem } from '../actions';
import { isKind, KINDS, type Kind } from '../types';

export const metadata: Metadata = { title: 'القوائم' };

interface Row {
  id: string;
  primary: string;
  secondary: string | null;
  extra: string | null;
  count?: number;
  hex?: string | null;
}

async function load(kind: Kind, tenantId: string): Promise<Row[]> {
  const base = { tenantId, isDeleted: false };

  switch (kind) {
    case 'categories': {
      const rows = await prisma.category.findMany({
        where: base,
        orderBy: { sortOrder: 'asc' },
        include: { _count: { select: { products: true } } },
      });
      return rows.map((r) => ({
        id: r.id,
        primary: r.nameAr,
        secondary: r.nameEn,
        extra: r.slug,
        count: r._count.products,
      }));
    }
    case 'colors': {
      const rows = await prisma.color.findMany({
        where: base,
        orderBy: { sortOrder: 'asc' },
        include: { _count: { select: { variants: true } } },
      });
      return rows.map((r) => ({
        id: r.id,
        primary: r.nameAr,
        secondary: r.nameEn,
        extra: r.hex,
        hex: r.hex,
        count: r._count.variants,
      }));
    }
    case 'sizes': {
      const rows = await prisma.size.findMany({
        where: base,
        orderBy: { sortOrder: 'asc' },
        include: { _count: { select: { variants: true } } },
      });
      return rows.map((r) => ({
        id: r.id,
        primary: r.nameAr,
        secondary: null,
        extra: r.code,
        count: r._count.variants,
      }));
    }
    case 'materials': {
      const rows = await prisma.material.findMany({
        where: base,
        orderBy: { nameAr: 'asc' },
        include: { _count: { select: { products: true } } },
      });
      return rows.map((r) => ({
        id: r.id,
        primary: r.nameAr,
        secondary: r.nameEn,
        extra: r.spec,
        count: r._count.products,
      }));
    }
    case 'printing': {
      const rows = await prisma.printingOption.findMany({
        where: base,
        orderBy: { nameAr: 'asc' },
        include: { _count: { select: { products: true } } },
      });
      return rows.map((r) => ({
        id: r.id,
        primary: r.nameAr,
        secondary: r.nameEn,
        extra: r.notes,
        count: r._count.products,
      }));
    }
    case 'embroidery': {
      const rows = await prisma.embroideryOption.findMany({
        where: base,
        orderBy: { nameAr: 'asc' },
        include: { _count: { select: { products: true } } },
      });
      return rows.map((r) => ({
        id: r.id,
        primary: r.nameAr,
        secondary: r.nameEn,
        extra: r.notes,
        count: r._count.products,
      }));
    }
  }
}

export default async function CatalogPage({ params }: { params: Promise<{ kind: string }> }) {
  const user = await requirePermission('products.read');
  const { kind } = await params;
  if (!isKind(kind)) notFound();

  const rows = await load(kind, user.tenantId);
  const canManage = can(user.role, 'catalog.manage');

  return (
    <AppShell user={user} title={KINDS[kind].labelAr}>
      <ModuleHeader title={KINDS[kind].labelAr} count={rows.length} />

      <nav className="mb-5 flex flex-wrap gap-2" aria-label="أقسام القوائم">
        {Object.entries(KINDS).map(([key, meta]) => (
          <Link
            key={key}
            href={`/catalog/${key}`}
            aria-current={key === kind ? 'page' : undefined}
            className={
              key === kind
                ? 'rounded-full bg-brand px-3.5 py-1.5 text-xs text-white'
                : 'rounded-full border border-line-2 px-3.5 py-1.5 text-xs text-txt-2 hover:border-brand hover:text-brand'
            }
          >
            {meta.labelAr}
          </Link>
        ))}
      </nav>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Table headers={['الاسم', 'بالإنجليزية', 'إضافي', 'مستخدم في', '']} empty={rows.length === 0}>
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-card-2">
              <td className="px-4 py-3 font-medium text-txt">
                <span className="flex items-center gap-2">
                  {row.hex && (
                    <span
                      aria-hidden="true"
                      className="inline-block h-3.5 w-3.5 rounded-full border border-line-2"
                      style={{ backgroundColor: row.hex }}
                    />
                  )}
                  {row.primary}
                </span>
              </td>
              <td dir="ltr" className="px-4 py-3 text-start text-txt-2">
                {row.secondary ?? '—'}
              </td>
              <td dir="ltr" className="px-4 py-3 text-start text-txt-3">
                {row.extra ?? '—'}
              </td>
              <td className="tnum px-4 py-3 text-txt-3">{row.count ?? 0}</td>
              <td className="px-4 py-3 text-end">
                {canManage && (
                  <form action={deleteCatalogItem.bind(null, kind, row.id)}>
                    <button type="submit" className="text-xs text-bad hover:underline">
                      حذف
                    </button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </Table>

        {canManage && (
          <section className="erp-card h-fit p-6">
            <h3 className="mb-4 text-sm font-semibold text-brand">
              إضافة {KINDS[kind].singular}
            </h3>
            <CatalogForm kind={kind} />
            <p className="mt-4 text-[0.7rem] text-txt-4">
              الحذف هنا حذف ناعم — السجل يبقى لحماية العلاقات التاريخية.
            </p>
          </section>
        )}
      </div>
    </AppShell>
  );
}
