'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { audit, fieldErrors, nextCode } from '@/lib/audit';
import { num } from '@/lib/num';

export interface FormState {
  error?: string;
  /** Set on success. The modal closes on it; the full page shows it. */
  ok?: string;
  fieldErrors?: Record<string, string>;
}

const SupplierSchema = z.object({
  name: z.string().trim().min(2, 'اسم المورّد مطلوب.').max(160),
  contactName: z.string().trim().max(120).optional().or(z.literal('')),
  phone: z.string().trim().min(6, 'رقم الهاتف مطلوب.').max(40),
  whatsapp: z.string().trim().max(40).optional().or(z.literal('')),
  email: z.string().trim().email('البريد الإلكتروني غير صحيح.').max(254).optional().or(z.literal('')),
  address: z.string().trim().max(400).optional().or(z.literal('')),
  taxNumber: z.string().trim().max(60).optional().or(z.literal('')),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
  rating: z.string().trim().optional(),
});

function read(formData: FormData) {
  return {
    name: String(formData.get('name') ?? ''),
    contactName: String(formData.get('contactName') ?? ''),
    phone: String(formData.get('phone') ?? ''),
    whatsapp: String(formData.get('whatsapp') ?? ''),
    email: String(formData.get('email') ?? ''),
    address: String(formData.get('address') ?? ''),
    taxNumber: String(formData.get('taxNumber') ?? ''),
    notes: String(formData.get('notes') ?? ''),
    rating: String(formData.get('rating') ?? ''),
  };
}

function payload(data: z.infer<typeof SupplierSchema>) {
  const rating = data.rating ? Number(data.rating) : null;
  return {
    name: data.name,
    phone: data.phone,
    contactName: data.contactName || null,
    whatsapp: data.whatsapp || null,
    email: data.email || null,
    address: data.address || null,
    taxNumber: data.taxNumber || null,
    notes: data.notes || null,
    rating: rating && rating >= 1 && rating <= 5 ? rating : null,
  };
}

/** The one implementation. The two entry points differ only in the ending. */
async function createSupplierCore(
  formData: FormData,
): Promise<{ state: FormState; id?: string; code?: string }> {
  const user = await requirePermission('suppliers.write');
  const parsed = SupplierSchema.safeParse(read(formData));
  if (!parsed.success) return { state: { fieldErrors: fieldErrors(parsed.error) } };

  const existing = await prisma.supplier.findMany({
    where: { tenantId: user.tenantId },
    select: { code: true },
  });

  const created = await prisma.supplier.create({
    data: { tenantId: user.tenantId, code: await nextCode('SUP', existing), ...payload(parsed.data) },
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'supplier.create',
    entityType: 'Supplier',
    entityId: created.id,
    detail: created.code,
  });

  revalidatePath('/suppliers');
  return { state: {}, id: created.id, code: created.code };
}

export async function createSupplier(_prev: FormState, formData: FormData): Promise<FormState> {
  const result = await createSupplierCore(formData);
  if (!result.id) return result.state;
  redirect(`/suppliers/${result.id}`);
}

/** Modal entry point — returns rather than navigating away from the list. */
export async function createSupplierInline(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await createSupplierCore(formData);
  if (!result.id) return result.state;
  return { ok: `تم إنشاء المورّد ${result.code}.` };
}

export async function updateSupplier(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePermission('suppliers.write');
  const parsed = SupplierSchema.safeParse(read(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const current = await prisma.supplier.findFirst({
    where: { id, tenantId: user.tenantId, isDeleted: false },
  });
  if (!current) return { error: 'المورّد غير موجود.' };

  await prisma.supplier.update({ where: { id }, data: payload(parsed.data) });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'supplier.update',
    entityType: 'Supplier',
    entityId: id,
    detail: current.code,
  });

  revalidatePath('/suppliers');
  revalidatePath(`/suppliers/${id}`);
  return { ok: 'تم حفظ التعديلات.' };
}

export async function deleteSupplier(id: string): Promise<void> {
  const user = await requirePermission('suppliers.write');
  const current = await prisma.supplier.findFirst({
    where: { id, tenantId: user.tenantId, isDeleted: false },
  });
  if (!current) redirect('/suppliers');

  await prisma.supplier.update({
    where: { id },
    data: { isDeleted: true, deletedAt: new Date() },
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'supplier.softDelete',
    entityType: 'Supplier',
    entityId: id,
    detail: current.code,
  });

  revalidatePath('/suppliers');
  redirect('/suppliers');
}

/** Link or unlink a product this supplier provides. */
export async function linkProduct(
  supplierId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePermission('suppliers.write');
  const productId = String(formData.get('productId') ?? '');
  if (!productId) return { fieldErrors: { productId: 'اختر منتجاً.' } };

  const exists = await prisma.supplierProduct.findUnique({
    where: { supplierId_productId: { supplierId, productId } },
  });
  if (exists) return { error: 'هذا المنتج مرتبط بالفعل.' };

  await prisma.supplierProduct.create({
    data: {
      supplierId,
      productId,
      supplierSku: String(formData.get('supplierSku') ?? '') || null,
      lastPrice: num(formData.get('lastPrice')) || null,
      leadTimeDays: num(formData.get('leadTimeDays')) || null,
    },
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'supplier.linkProduct',
    entityType: 'Supplier',
    entityId: supplierId,
    detail: productId,
  });

  revalidatePath(`/suppliers/${supplierId}`);
  return {};
}

export async function unlinkProduct(supplierId: string, productId: string): Promise<void> {
  await requirePermission('suppliers.write');
  await prisma.supplierProduct.delete({
    where: { supplierId_productId: { supplierId, productId } },
  });
  revalidatePath(`/suppliers/${supplierId}`);
}
