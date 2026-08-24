'use client';

import Link from 'next/link';
import { FormModal, EditModal } from '@/components/crud/FormModal';
import { ProductForm, type Option, type ProductValues } from './ProductForm';
import { createProductInline, updateProduct } from './actions';

export interface ProductFormOptions {
  categories: Option[];
  materials: Option[];
  printingOptions: Option[];
  embroideryOptions: Option[];
  colors: Option[];
  sizes: Option[];
}

/**
 * منتج جديد — modal.
 *
 * Wide, because the product form carries pricing plus three checkbox groups.
 * Creating still produces the default variant, exactly as the full page does:
 * stock lives on the variant, so a product without one cannot be stocked.
 */
export function NewProductModal({ options }: { options: ProductFormOptions }) {
  return (
    <FormModal
      trigger="منتج جديد"
      title="منتج جديد"
      description="اختر الألوان والمقاسات لتُنشأ متغيّراتها وتظهر في المخزون."
      wide
    >
      {(onSuccess) => (
        <ProductForm
          action={createProductInline}
          categories={options.categories}
          materials={options.materials}
          printingOptions={options.printingOptions}
          embroideryOptions={options.embroideryOptions}
          colors={options.colors}
          sizes={options.sizes}
          showVariants
          submitLabel="حفظ المنتج"
          onSuccess={onSuccess}
        />
      )}
    </FormModal>
  );
}

export function EditProductModal({
  id,
  sku,
  values,
  options,
  selected,
}: {
  id: string;
  sku: string;
  values: ProductValues;
  options: ProductFormOptions;
  selected?: { materials: string[]; printing: string[]; embroidery: string[] };
}) {
  return (
    <EditModal label="تعديل" title={`تعديل المنتج ${sku}`} wide>
      {(onSuccess) => (
        <>
          {/* هذا المودال للبيانات الأساسية فقط. الألوان والمقاسات وأسعار البيع
              ورفع الصور تُدار من صفحة المنتج الكاملة — رابط واضح إليها هنا لأن
              المستخدم كان يتوقّع كل ذلك داخل «تعديل». */}
          <Link
            href={`/catalog/products/${id}`}
            className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-brand/40 bg-brand/5 px-4 py-3 text-sm text-brand transition-colors hover:bg-brand/10"
          >
            <span className="font-medium">الألوان والمقاسات وأسعار البيع ورفع الصور</span>
            <span aria-hidden="true">افتح صفحة المنتج ←</span>
          </Link>
          <ProductForm
          action={updateProduct.bind(null, id)}
          values={values}
          categories={options.categories}
          materials={options.materials}
          printingOptions={options.printingOptions}
          embroideryOptions={options.embroideryOptions}
          selected={selected}
          submitLabel="حفظ التعديلات"
          onSuccess={onSuccess}
          />
        </>
      )}
    </EditModal>
  );
}
