'use client';

import { useActionState, useState } from 'react';
import { Select, SubmitButton, FormError } from '@/components/crud/Form';
import type { FormState } from './shared';

export interface ProductOption {
  value: string;
  label: string;
  variants: { value: string; label: string }[];
}

/**
 * ربط المعادلة بمنتج.
 *
 * Leaving the variant empty assigns the formula to every variant of the
 * product — the common case, since a printing recipe rarely differs between
 * an M and an L.
 */
export function AssignForm({
  action,
  products,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  products: ProductOption[];
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const [productId, setProductId] = useState('');

  if (products.length === 0) {
    return <p className="text-sm text-txt-3">لا توجد منتجات نشطة لربطها.</p>;
  }

  const variants = products.find((p) => p.value === productId)?.variants ?? [];

  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state.error} />

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="productId" className="mb-1.5 block text-xs text-txt-2">
            المنتج <span className="ms-1 text-bad">*</span>
          </label>
          <select
            id="productId"
            name="productId"
            required
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            className="erp-input py-2.5"
          >
            <option value="">اختر منتجاً…</option>
            {products.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          {state.fieldErrors?.productId && (
            <p className="mt-1 text-[0.7rem] text-bad">{state.fieldErrors.productId}</p>
          )}
        </div>

        <Select
          key={productId}
          name="variantId"
          label="المتغيّر"
          options={variants}
          placeholder="كل المتغيّرات"
          errors={state.fieldErrors}
        />
      </div>

      <div className="flex items-center gap-3">
        <SubmitButton label="ربط" />
        {state.ok && <span className="text-xs text-ok">{state.ok}</span>}
      </div>
    </form>
  );
}
