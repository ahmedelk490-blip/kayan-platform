/**
 * RBAC — roles, permissions, and the check itself.
 *
 * Pure data and pure functions. No database, no request, no framework — so
 * the permission matrix is unit-testable without standing anything up, which
 * is the point of Article 1.
 */

export const ROLE_KEYS = ['ADMIN', 'MANAGER', 'SALES', 'CUSTOMER'] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

export interface RoleDefinition {
  key: RoleKey;
  name: string;
  nameAr: string;
  /** Where this role lands immediately after login. */
  landingPath: string;
}

export const ROLES: Record<RoleKey, RoleDefinition> = {
  ADMIN: {
    key: 'ADMIN',
    name: 'Administrator',
    nameAr: 'مدير النظام',
    landingPath: '/admin',
  },
  MANAGER: {
    key: 'MANAGER',
    name: 'Manager',
    nameAr: 'المدير',
    landingPath: '/dashboard',
  },
  SALES: {
    key: 'SALES',
    name: 'Sales Representative',
    nameAr: 'مندوب المبيعات',
    landingPath: '/sales',
  },
  CUSTOMER: {
    key: 'CUSTOMER',
    name: 'Customer',
    nameAr: 'عميل',
    landingPath: '/portal',
  },
};

/** Every permission the system recognises. Adding one here is the only way. */
export const PERMISSIONS = {
  'dashboard.view': { nameAr: 'عرض لوحة المدير', group: 'لوحات المعلومات' },
  'sales.view': { nameAr: 'عرض لوحة المبيعات', group: 'لوحات المعلومات' },
  'portal.view': { nameAr: 'عرض بوابة العميل', group: 'لوحات المعلومات' },
  'admin.view': { nameAr: 'عرض لوحة الإدارة', group: 'لوحات المعلومات' },

  'products.read': { nameAr: 'عرض المنتجات', group: 'المنتجات' },
  'products.write': { nameAr: 'تعديل المنتجات', group: 'المنتجات' },

  'customers.read': { nameAr: 'عرض العملاء', group: 'العملاء' },
  'customers.write': { nameAr: 'تعديل العملاء', group: 'العملاء' },

  // Added in Phase 3. Extending the matrix, not rebuilding it — supplier
  // management was requested and had no permission to guard it.
  'suppliers.read': { nameAr: 'عرض الموردين', group: 'الموردون' },
  'suppliers.write': { nameAr: 'تعديل الموردين', group: 'الموردون' },

  'catalog.manage': { nameAr: 'إدارة التصنيفات والقوائم', group: 'المنتجات' },

  'inventory.read': { nameAr: 'عرض المخزون', group: 'المخزون' },
  'inventory.write': { nameAr: 'تعديل المخزون', group: 'المخزون' },

  'manufacturing.read': { nameAr: 'عرض التصنيع', group: 'التصنيع' },
  'manufacturing.write': { nameAr: 'تعديل التصنيع', group: 'التصنيع' },
  'formula.write': { nameAr: 'تعديل المعادلات', group: 'التصنيع' },

  'cost.read': { nameAr: 'عرض التكلفة', group: 'التكلفة' },
  /** Margin is deliberately separable from cost — FR-IAM-006. */
  'cost.margin': { nameAr: 'عرض هامش الربح', group: 'التكلفة' },

  'reports.view': { nameAr: 'عرض التقارير', group: 'التقارير' },
  'users.manage': { nameAr: 'إدارة المستخدمين', group: 'النظام' },
  'settings.manage': { nameAr: 'إدارة الإعدادات', group: 'النظام' },
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as PermissionKey[];

/**
 * The permission matrix.
 *
 * Deny by default (NFR-12): a role holds exactly what is listed and nothing
 * more. CUSTOMER is deliberately tiny — a customer must never reach cost or
 * margin data.
 */
export const ROLE_PERMISSIONS: Record<RoleKey, PermissionKey[]> = {
  ADMIN: ALL_PERMISSIONS,

  MANAGER: [
    'dashboard.view',
    'sales.view',
    'products.read',
    'products.write',
    'catalog.manage',
    'customers.read',
    'customers.write',
    'suppliers.read',
    'suppliers.write',
    'inventory.read',
    'inventory.write',
    'manufacturing.read',
    'manufacturing.write',
    'formula.write',
    'cost.read',
    'cost.margin',
    'reports.view',
  ],

  SALES: [
    'sales.view',
    'products.read',
    'customers.read',
    'customers.write',
    'suppliers.read',
    'inventory.read',
    'cost.read',
    'reports.view',
    // Deliberately NOT cost.margin — a representative sees cost to quote
    // sensibly, but company margin is not theirs to see.
  ],

  CUSTOMER: ['portal.view', 'products.read'],
};

/** Deny by default. */
export function can(role: RoleKey | undefined, permission: PermissionKey): boolean {
  if (!role) return false;
  const granted = ROLE_PERMISSIONS[role];
  if (!granted) return false;
  return granted.includes(permission);
}

/** True if the role holds every permission listed. */
export function canAll(role: RoleKey | undefined, permissions: PermissionKey[]): boolean {
  return permissions.every((p) => can(role, p));
}

/** True if the role holds at least one. */
export function canAny(role: RoleKey | undefined, permissions: PermissionKey[]): boolean {
  return permissions.some((p) => can(role, p));
}

export function landingPathFor(role: RoleKey): string {
  return ROLES[role].landingPath;
}

export function isRoleKey(value: string): value is RoleKey {
  return (ROLE_KEYS as readonly string[]).includes(value);
}
