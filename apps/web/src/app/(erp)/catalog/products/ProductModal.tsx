'use client';

import { FormModal, EditModal } from '@/components/crud/FormModal';
import { ProductForm, type Option, type ProductValues } from './ProductForm';
import { createProductInline, updateProduct } from './actions';

export interface ProductFormOptions {
  categories: Option[];
  materials: Option[];
  printingOptions: Option[];
  embroideryOptions: Option[];
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
      description="يُنشأ متغيّر افتراضي تلقائياً — المخزون يُتتبَّع على مستوى المتغيّر."
      wide
    >
      {(onSuccess) => (
        <ProductForm
          action={createProductInline}
          categories={options.categories}
          materials={options.materials}
          printingOptions={options.printingOptions}
          embroideryOptions={options.embroideryOptions}
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
      )}
    </EditModal>
  );
}
