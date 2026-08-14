'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { audit, fieldErrors } from '@/lib/audit';

export interface FormState {
  error?: string;
  ok?: string;
  fieldErrors?: Record<string, string>;
}

const WarehouseSchema = z.object({
  code: z.string().trim().min(2, 'الرمز مطلوب.').max(30),
  nameAr: z.string().trim().min(2, 'الاسم مطلوب.').max(120),
  address: z.string().trim().max(300).optional().or(z.literal('')),
});

export async function createWarehouse(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission('inventory.write');
  const parsed = WarehouseSchema.safeParse({
    code: String(formData.get('code') ?? ''),
    nameAr: String(formData.get('nameAr') ?? ''),
    address: String(formData.get('address') ?? ''),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const clash = await prisma.warehouse.findFirst({
    where: { tenantId: user.tenantId, code: parsed.data.code },
  });
  if (clash) return { fieldErrors: { code: 'هذا الرمز مستخدم بالفعل.' } };

  const created = await prisma.warehouse.create({
    data: {
      tenantId: user.tenantId,
      code: parsed.data.code,
      nameAr: parsed.data.nameAr,
      address: parsed.data.address || null,
    },
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'warehouse.create',
    entityType: 'Warehouse',
    entityId: created.id,
    detail: created.code,
  });

  revalidatePath('/warehouses');
  return { ok: 'تم إنشاء المخزن.' };
}

export async function deleteWarehouse(id: string): Promise<void> {
  const user = await requirePermission('inventory.write');
  await prisma.warehouse.update({
    where: { id },
    data: { isDeleted: true, deletedAt: new Date() },
  });
  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'warehouse.softDelete',
    entityType: 'Warehouse',
    entityId: id,
  });
  revalidatePath('/warehouses');
}

const LocationSchema = z.object({
  code: z.string().trim().min(1, 'الرمز مطلوب.').max(30),
  nameAr: z.string().trim().max(120).optional().or(z.literal('')),
});

export async function createLocation(
  warehouseId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePermission('inventory.write');
  const parsed = LocationSchema.safeParse({
    code: String(formData.get('code') ?? ''),
    nameAr: String(formData.get('nameAr') ?? ''),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const clash = await prisma.warehouseLocation.findFirst({
    where: { warehouseId, code: parsed.data.code },
  });
  if (clash) return { fieldErrors: { code: 'هذا الرمز مستخدم في هذا المخزن.' } };

  await prisma.warehouseLocation.create({
    data: { warehouseId, code: parsed.data.code, nameAr: parsed.data.nameAr || null },
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'location.create',
    entityType: 'WarehouseLocation',
    detail: parsed.data.code,
  });

  revalidatePath('/warehouses');
  return { ok: 'تمت الإضافة.' };
}

export async function deleteLocation(id: string): Promise<void> {
  await requirePermission('inventory.write');
  await prisma.warehouseLocation.update({
    where: { id },
    data: { isDeleted: true, deletedAt: new Date() },
  });
  revalidatePath('/warehouses');
}
