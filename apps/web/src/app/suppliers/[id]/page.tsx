import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { can } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader, Table } from '@/components/crud/Shell';
import { SupplierForm } from '../SupplierForm';
import { updateSupplier, deleteSupplier, unlinkProduct } from '../actions';
import { LinkProductForm } from './LinkProductForm';

export const metadata: Metadata = { title: 'بيانات المورّد' };

export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission('suppliers.read');
  const { id } = await params;

  const supplier = await prisma.supplier.findFirst({
    where: { id, tenantId: user.tenantId, isDeleted: false },
    include: {
      products: { include: { product: { select: { id: true, nameAr: true, sku: true } } } },
      attachments: true,
    },
  });
  if (!supplier) notFound();

  const products = await prisma.product.findMany({
    where: { tenantId: user.tenantId, isDeleted: false },
    orderBy: { nameAr: 'asc' },
    select: { id: true, nameAr: true, sku: true },
  });

  const canWrite = can(user.role, 'suppliers.write');
  const update = updateSupplier.bind(null, supplier.id);
  const remove = deleteSupplier.bind(null, supplier.id);
  const linkedIds = new Set(supplier.products.map((p) => p.productId));

  return (
    <AppShell user={user} title={supplier.name}>
      <ModuleHeader
        title={supplier.name}
        action={
          <div className="flex gap-2">
            <Link href="/suppliers" className="erp-btn-ghost">
              رجوع
            </Link>
            {canWrite && (
              <form action={remove}>
                <button
                  type="submit"
                  className="rounded-lg border border-bad px-4 py-2 text-xs text-bad transition-colors hover:bg-bad-soft"
                >
                  حذف
                </button>
              </form>
            )}
          </div>
        }
      />

      <p className="mb-5 text-xs text-txt-3">
        الكود <span dir="ltr" className="tnum">{supplier.code}</span>
      </p>

      <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
        <section className="erp-card p-6">
          <h3 className="mb-5 text-sm font-semibold text-brand">البيانات</h3>
          <SupplierForm action={update} values={supplier} submitLabel="حفظ التعديلات" />
        </section>

        <div className="space-y-6">
          <section>
            <h3 className="mb-3 text-sm font-semibold text-brand">
              المنتجات المورَّدة ({supplier.products.length})
            </h3>
            <Table headers={['المنتج', 'كود المورّد', 'آخر سعر', 'مدة التوريد', '']} empty={supplier.products.length === 0}>
              {supplier.products.map((sp) => (
                <tr key={sp.productId} className="hover:bg-card-2">
                  <td className="px-4 py-3 text-txt">{sp.product.nameAr}</td>
                  <td dir="ltr" className="px-4 py-3 text-start text-txt-3">
                    {sp.supplierSku ?? '—'}
                  </td>
                  <td className="tnum px-4 py-3 text-txt-2">{sp.lastPrice ?? '—'}</td>
                  <td className="tnum px-4 py-3 text-txt-2">
                    {sp.leadTimeDays ? `${sp.leadTimeDays} يوم` : '—'}
                  </td>
                  <td className="px-4 py-3 text-end">
                    {canWrite && (
                      <form action={unlinkProduct.bind(null, supplier.id, sp.productId)}>
                        <button type="submit" className="text-xs text-bad hover:underline">
                          إلغاء الربط
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          </section>

          {canWrite && (
            <section className="erp-card p-6">
              <h3 className="mb-4 text-sm font-semibold text-brand">ربط منتج</h3>
              <LinkProductForm
                supplierId={supplier.id}
                products={products
                  .filter((p) => !linkedIds.has(p.id))
                  .map((p) => ({ value: p.id, label: `${p.nameAr} (${p.sku})` }))}
              />
            </section>
          )}

          <section className="erp-card p-6">
            <h3 className="mb-2 text-sm font-semibold text-brand">سجل المشتريات</h3>
            <p className="text-xs text-txt-3">
              يظهر هنا بعد بناء وحدة المشتريات. العلاقات في قاعدة البيانات جاهزة.
            </p>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
