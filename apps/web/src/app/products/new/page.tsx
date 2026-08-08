import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePermission } from '@/lib/guard';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader } from '@/components/crud/Shell';
import { ProductForm } from '../ProductForm';
import { createProduct } from '../actions';
import { loadProductOptions } from '../options';

export const metadata: Metadata = { title: 'منتج جديد' };

export default async function NewProductPage() {
  const user = await requirePermission('products.write');
  const options = await loadProductOptions(user.tenantId);

  return (
    <AppShell user={user} title="منتج جديد">
      <ModuleHeader
        title="منتج جديد"
        action={
          <Link href="/products" className="erp-btn-ghost">
            رجوع
          </Link>
        }
      />
      <div className="erp-card max-w-4xl p-6">
        <ProductForm
          action={createProduct}
          categories={options.categories}
          materials={options.materials}
          printingOptions={options.printingOptions}
          embroideryOptions={options.embroideryOptions}
          submitLabel="إنشاء المنتج"
        />
        <p className="mt-4 text-[0.7rem] text-txt-4">
          يُنشأ متغيّر افتراضي تلقائياً — المخزون يُتتبَّع على مستوى المتغيّر وليس المنتج.
        </p>
      </div>
    </AppShell>
  );
}
