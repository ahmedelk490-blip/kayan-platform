import 'server-only';

import { prisma } from '@/lib/prisma';

/** Lookup options shared by the product create and edit forms. */
export async function loadProductOptions(tenantId: string) {
  const [categories, materials, printingOptions, embroideryOptions, colors, sizes] =
    await Promise.all([
      prisma.category.findMany({
        where: { tenantId, isDeleted: false },
        orderBy: { sortOrder: 'asc' },
      }),
      prisma.material.findMany({ where: { tenantId, isDeleted: false }, orderBy: { nameAr: 'asc' } }),
      prisma.printingOption.findMany({
        where: { tenantId, isDeleted: false },
        orderBy: { nameAr: 'asc' },
      }),
      prisma.embroideryOption.findMany({
        where: { tenantId, isDeleted: false },
        orderBy: { nameAr: 'asc' },
      }),
      prisma.color.findMany({ where: { tenantId, isDeleted: false }, orderBy: { sortOrder: 'asc' } }),
      prisma.size.findMany({ where: { tenantId, isDeleted: false }, orderBy: { sortOrder: 'asc' } }),
    ]);

  return {
    categories: categories.map((c) => ({ value: c.id, label: c.nameAr })),
    materials: materials.map((m) => ({ value: m.id, label: m.nameAr })),
    printingOptions: printingOptions.map((p) => ({ value: p.id, label: p.nameAr })),
    embroideryOptions: embroideryOptions.map((e) => ({ value: e.id, label: e.nameAr })),
    colors: colors.map((c) => ({ value: c.id, label: c.nameAr })),
    sizes: sizes.map((s) => ({ value: s.id, label: `${s.code} — ${s.nameAr}` })),
  };
}
