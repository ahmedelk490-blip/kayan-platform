'use client';

import { useActionState } from 'react';
import { Field, TextArea, SubmitButton, FormError } from '@/components/crud/Form';
import type { FormState } from './shared';

/**
 * نموذج الإعدادات المالية.
 *
 * Grouped by who asks for the number rather than by database column: the
 * accountant asks about VAT and terms, the customer's finance department asks
 * about the tax number, and the invoice numbering is the system's own.
 *
 * Every field starts at whatever is stored, including empty. Nothing here
 * pre-fills a plausible-looking value.
 */
export function SettingsForm({
  action,
  company,
  issuedInvoices,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  company: {
    nameAr: string;
    currency: string;
    defaultTaxRate: string;
    paymentTermDays: number;
    invoicePrefix: string;
    taxNumber: string | null;
    commercialRegister: string | null;
    paymentTerms: string | null;
  };
  issuedInvoices: number;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-6">
      <FormError message={state.error} />

      {!company.taxNumber && (
        <p className="rounded-lg border border-warn bg-warn-soft px-4 py-3 text-xs leading-[1.9] text-warn">
          الرقم الضريبي غير مُدخَل. كل فاتورة تُطبع الآن تحمل تنبيهاً بدل الرقم — ولم
          يُخترَع رقم في أي مكان. أدخِله من السجلات الرسمية للشركة.
        </p>
      )}

      <section className="erp-card p-5">
        <h3 className="mb-1 text-sm font-semibold text-brand">بيانات الشركة</h3>
        <p className="mb-4 text-[0.7rem] text-txt-4">
          الاسم والعملة كما يظهران على المستندات المطبوعة.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            name="nameAr"
            label="اسم الشركة"
            required
            defaultValue={company.nameAr}
            errors={state.fieldErrors}
          />
          <Field
            name="currency"
            label="العملة"
            required
            dir="ltr"
            defaultValue={company.currency}
            errors={state.fieldErrors}
            hint="رمز قصير يظهر بجوار المبالغ، مثل EGP."
          />
        </div>
      </section>

      <section className="erp-card p-5">
        <h3 className="mb-1 text-sm font-semibold text-brand">الضريبة والسداد</h3>
        <p className="mb-4 text-[0.7rem] leading-[1.9] text-txt-4">
          تُطبَّق على المستندات الجديدة فقط. الفواتير الصادرة تحمل نسبتها وإجمالياتها
          المحفوظة وقت الإصدار ولا تتأثر بأي تعديل هنا.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            name="defaultTaxRate"
            label="نسبة الضريبة الافتراضية (%)"
            type="number"
            dir="ltr"
            required
            defaultValue={company.defaultTaxRate}
            errors={state.fieldErrors}
            hint="0 تعني بلا ضريبة. أدخِل النسبة المعتمدة رسمياً للنشاط."
          />
          <Field
            name="paymentTermDays"
            label="مهلة السداد (أيام)"
            type="number"
            dir="ltr"
            required
            defaultValue={String(company.paymentTermDays)}
            errors={state.fieldErrors}
            hint="تُحسب منها تواريخ الاستحقاق. 0 تعني الاستحقاق فور الإصدار."
          />
        </div>
        <div className="mt-4">
          <TextArea
            name="paymentTerms"
            label="نص شروط الدفع على المستند"
            defaultValue={company.paymentTerms}
            errors={state.fieldErrors}
            rows={2}
          />
          <p className="mt-1 text-[0.7rem] text-txt-4">
            يُطبع كما هو أسفل الفاتورة وعرض السعر. اتركه فارغاً ولن يُطبع شيء — أفضل من
            شرط لم يتفق عليه أحد.
          </p>
        </div>
      </section>

      <section className="erp-card p-5">
        <h3 className="mb-1 text-sm font-semibold text-brand">البيانات الرسمية</h3>
        <p className="mb-4 text-[0.7rem] leading-[1.9] text-txt-4">
          تُطبع على المستندات عند إدخالها فقط.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            name="taxNumber"
            label="الرقم الضريبي"
            dir="ltr"
            defaultValue={company.taxNumber}
            errors={state.fieldErrors}
          />
          <Field
            name="commercialRegister"
            label="السجل التجاري"
            dir="ltr"
            defaultValue={company.commercialRegister}
            errors={state.fieldErrors}
          />
        </div>
      </section>

      <section className="erp-card p-5">
        <h3 className="mb-1 text-sm font-semibold text-brand">ترقيم الفواتير</h3>
        <p className="mb-4 text-[0.7rem] leading-[1.9] text-txt-4">
          {issuedInvoices > 0
            ? `الترقيم متسلسل بلا فجوات، وقد صدرت ${issuedInvoices} فاتورة بهذه البادئة — لذلك لا يمكن تغييرها الآن دون تكرار أرقام سبق تسليمها لعملاء.`
            : 'الترقيم متسلسل بلا فجوات. يمكن تغيير البادئة الآن لأنه لم تُصدر أي فاتورة بعد.'}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            name="invoicePrefix"
            label="بادئة رقم الفاتورة"
            dir="ltr"
            required
            defaultValue={company.invoicePrefix}
            errors={state.fieldErrors}
            hint={`الشكل الناتج: ${company.invoicePrefix}-${new Date().getFullYear()}-0001`}
          />
        </div>
      </section>

      <div className="flex items-center gap-3">
        <SubmitButton label="حفظ الإعدادات" />
        {state.ok && <span className="text-xs text-ok">{state.ok}</span>}
      </div>
    </form>
  );
}
