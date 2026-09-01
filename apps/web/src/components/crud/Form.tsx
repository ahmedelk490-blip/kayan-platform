'use client';

import { useFormStatus } from 'react-dom';

/**
 * أساسيات النماذج.
 *
 * Errors are rendered as text tied to their field with aria-describedby —
 * colour alone never carries the message (WCAG 1.4.1).
 */

export interface FieldErrors {
  [field: string]: string | undefined;
}

export function Field({
  name,
  label,
  errors,
  required,
  type = 'text',
  defaultValue,
  value,
  onChange,
  placeholder,
  dir,
  hint,
}: {
  name: string;
  label: string;
  errors?: FieldErrors;
  required?: boolean;
  type?: string;
  defaultValue?: string | number | null;
  /** الوضع المضبوط: مرِّر value+onChange كي لا يمسح خطأُ الخادم ما كتبه المستخدم. */
  value?: string | number;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  dir?: 'ltr' | 'rtl';
  hint?: string;
}) {
  const error = errors?.[name];
  return (
    <div>
      <label htmlFor={name} className="mb-1.5 block text-xs text-txt-2">
        {label}
        {required && <span className="ms-1 text-bad">*</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        dir={dir}
        required={required}
        {...(value !== undefined ? { value, onChange } : { defaultValue: defaultValue ?? undefined })}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${name}-error` : hint ? `${name}-hint` : undefined}
        className={`erp-input py-2.5 ${dir === 'ltr' ? 'text-start' : ''} ${error ? 'border-bad' : ''}`}
      />
      {hint && !error && (
        <p id={`${name}-hint`} className="mt-1 text-[0.7rem] text-txt-4">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${name}-error`} className="mt-1 text-[0.7rem] text-bad">
          {error}
        </p>
      )}
    </div>
  );
}

export function TextArea({
  name,
  label,
  errors,
  defaultValue,
  value,
  onChange,
  rows = 3,
}: {
  name: string;
  label: string;
  errors?: FieldErrors;
  defaultValue?: string | null;
  /** الوضع المضبوط: مرِّر value+onChange كي لا يمسح خطأُ الخادم ما كتبه المستخدم. */
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  rows?: number;
}) {
  const error = errors?.[name];
  return (
    <div>
      <label htmlFor={name} className="mb-1.5 block text-xs text-txt-2">
        {label}
      </label>
      <textarea
        id={name}
        name={name}
        rows={rows}
        {...(value !== undefined ? { value, onChange } : { defaultValue: defaultValue ?? undefined })}
        aria-invalid={Boolean(error)}
        className={`erp-input resize-y py-2.5 ${error ? 'border-bad' : ''}`}
      />
      {error && <p className="mt-1 text-[0.7rem] text-bad">{error}</p>}
    </div>
  );
}

export function Select({
  name,
  label,
  options,
  defaultValue,
  errors,
  required,
  placeholder,
}: {
  name: string;
  label: string;
  options: { value: string; label: string }[];
  defaultValue?: string | null;
  errors?: FieldErrors;
  required?: boolean;
  placeholder?: string;
}) {
  const error = errors?.[name];
  return (
    <div>
      <label htmlFor={name} className="mb-1.5 block text-xs text-txt-2">
        {label}
        {required && <span className="ms-1 text-bad">*</span>}
      </label>
      <select
        id={name}
        name={name}
        required={required}
        defaultValue={defaultValue ?? ''}
        aria-invalid={Boolean(error)}
        className={`erp-input py-2.5 ${error ? 'border-bad' : ''}`}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-[0.7rem] text-bad">{error}</p>}
    </div>
  );
}

/** مجموعة اختيارات متعددة — للخامات وخيارات الطباعة والتطريز. */
export function CheckboxGroup({
  name,
  label,
  options,
  selected = [],
}: {
  name: string;
  label: string;
  options: { value: string; label: string }[];
  selected?: string[];
}) {
  if (options.length === 0) return null;
  return (
    <fieldset>
      <legend className="mb-2 text-xs text-txt-2">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label
            key={o.value}
            className="cursor-pointer rounded-full border border-line-2 px-3 py-1.5 text-xs text-txt-2 transition-colors has-[:checked]:border-brand has-[:checked]:bg-brand-soft has-[:checked]:text-brand"
          >
            <input
              type="checkbox"
              name={name}
              value={o.value}
              defaultChecked={selected.includes(o.value)}
              className="sr-only"
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function SubmitButton({ label = 'حفظ' }: { label?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="erp-btn">
      {pending ? 'جارٍ الحفظ…' : label}
    </button>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg border border-bad bg-bad-soft px-4 py-3 text-xs text-bad">
      {message}
    </p>
  );
}
