'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { audit, fieldErrors, nextCode } from '@/lib/audit';

export interface FormState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

const CustomerSchema = z.object({
  companyName: z.string().trim().max(160).optional().or(z.literal('')),
  contactName: z.string().trim().min(2, 'اسم المسؤول مطلوب.').max(120),
  phone: z.string().trim().min(6, 'رقم الهاتف مطلوب.').max(40),
  whatsapp: z.string().trim().max(40).optional().or(z.literal('')),
  email: z.string().trim().email('البريد الإلكتروني غير صحيح.').max(254).optional().or(z.literal('')),
  address: z.string().trim().max(400).optional().or(z.literal('')),
  taxNumber: z.string().trim().max(60).optional().or(z.literal('')),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
});

function read(formData: FormData) {
  return {
    companyName: String(formData.get('companyName') ?? ''),
    contactName: String(formData.get('contactName') ?? ''),
    phone: String(formData.get('phone') ?? ''),
    whatsapp: String(formData.get('whatsapp') ?? ''),
    email: String(formData.get('email') ?? ''),
    address: String(formData.get('address') ?? ''),
    taxNumber: String(formData.get('taxNumber') ?? ''),
    notes: String(formData.get('notes') ?? ''),
  };
}

/** Empty optional strings become null so the column stays clean. */
function nullify<T extends Record<string, string | undefined>>(data: T) {
  const out: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(data)) out[k] = v && v.length > 0 ? v : null;
  return out;
}

export async function createCustomer(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission('customers.write');
  const parsed = CustomerSchema.safeParse(read(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const existing = await prisma.customer.findMany({
    where: { tenantId: user.tenantId },
    select: { code: true },
  });

  const data = nullify(parsed.data);
  const created = await prisma.customer.create({
    data: {
      tenantId: user.tenantId,
      code: await nextCode('CUS', existing),
      contactName: parsed.data.contactName,
      phone: parsed.data.phone,
      companyName: data.companyName,
      whatsapp: data.whatsapp,
      email: data.email,
      address: data.address,
      taxNumber: data.taxNumber,
      notes: data.notes,
    },
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'customer.create',
    entityType: 'Customer',
    entityId: created.id,
    detail: created.code,
  });

  revalidatePath('/customers');
  redirect(`/customers/${created.id}`);
}

export async function updateCustomer(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePermission('customers.write');
  const parsed = CustomerSchema.safeParse(read(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const current = await prisma.customer.findFirst({
    where: { id, tenantId: user.tenantId, isDeleted: false },
  });
  if (!current) return { error: 'العميل غير موجود.' };

  const data = nullify(parsed.data);
  await prisma.customer.update({
    where: { id },
    data: {
      contactName: parsed.data.contactName,
      phone: parsed.data.phone,
      companyName: data.companyName,
      whatsapp: data.whatsapp,
      email: data.email,
      address: data.address,
      taxNumber: data.taxNumber,
      notes: data.notes,
    },
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'customer.update',
    entityType: 'Customer',
    entityId: id,
    detail: current.code,
  });

  revalidatePath('/customers');
  revalidatePath(`/customers/${id}`);
  return {};
}

/**
 * Soft delete. The row stays so historical relations — future quotations,
 * orders, invoices — keep pointing at something real.
 */
export async function deleteCustomer(id: string): Promise<void> {
  const user = await requirePermission('customers.write');

  const current = await prisma.customer.findFirst({
    where: { id, tenantId: user.tenantId, isDeleted: false },
  });
  if (!current) redirect('/customers');

  await prisma.customer.update({
    where: { id },
    data: { isDeleted: true, deletedAt: new Date() },
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'customer.softDelete',
    entityType: 'Customer',
    entityId: id,
    detail: current.code,
  });

  revalidatePath('/customers');
  redirect('/customers');
}

export async function restoreCustomer(id: string): Promise<void> {
  const user = await requirePermission('customers.write');
  await prisma.customer.updateMany({
    where: { id, tenantId: user.tenantId },
    data: { isDeleted: false, deletedAt: null },
  });
  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'customer.restore',
    entityType: 'Customer',
    entityId: id,
  });
  revalidatePath('/customers');
}

const ActivitySchema = z.object({
  type: z.enum(['NOTE', 'CALL', 'VISIT', 'MEETING', 'WHATSAPP', 'EMAIL']),
  title: z.string().trim().min(2, 'العنوان مطلوب.').max(160),
  body: z.string().trim().max(2000).optional().or(z.literal('')),
});

export async function addActivity(
  customerId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePermission('customers.write');
  const parsed = ActivitySchema.safeParse({
    type: String(formData.get('type') ?? 'NOTE'),
    title: String(formData.get('title') ?? ''),
    body: String(formData.get('body') ?? ''),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, tenantId: user.tenantId, isDeleted: false },
  });
  if (!customer) return { error: 'العميل غير موجود.' };

  await prisma.customerActivity.create({
    data: {
      customerId,
      type: parsed.data.type,
      title: parsed.data.title,
      body: parsed.data.body || null,
      userId: user.id,
    },
  });

  revalidatePath(`/customers/${customerId}`);
  return {};
}
