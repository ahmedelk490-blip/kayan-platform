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

  // Phase 4. sales.write covers creating and editing quotations and orders;
  // sales.confirm is separate because confirming an order moves stock.
  'sales.documents': { nameAr: 'عرض عروض الأسعار وأوامر البيع', group: 'المبيعات' },
  'sales.write': { nameAr: 'إنشاء وتعديل مستندات البيع', group: 'المبيعات' },
  'sales.confirm': { nameAr: 'تأكيد وإلغاء أوامر البيع', group: 'المبيعات' },
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

  // Phase 5. `manufacturing.read` was renamed to `.view` to match the
  // naming the client specified; nothing else about RBAC changed.
  'manufacturing.view': { nameAr: 'عرض أوامر الإنتاج', group: 'التصنيع' },
  'manufacturing.write': { nameAr: 'إنشاء وتعديل أوامر الإنتاج', group: 'التصنيع' },
  'manufacturing.confirm': { nameAr: 'تأكيد وتشغيل وإلغاء أوامر الإنتاج', group: 'التصنيع' },

  // Phase 6. Reading a formula and editing one are separate: a formula is
  // manufacturing know-how, and publishing a version changes what every
  // future costing produces.
  'formula.view': { nameAr: 'عرض المعادلات', group: 'التصنيع' },
  'formula.write': { nameAr: 'إنشاء وتعديل ونشر المعادلات', group: 'التصنيع' },

  // Phase 6 renamed `cost.read` to `.view` to match the naming the client
  // specified, and for consistency with manufacturing.view. Nothing else
  // about the cost permissions changed.
  'cost.view': { nameAr: 'عرض التكلفة', group: 'التكلفة' },
  /** Margin is deliberately separable from cost — FR-IAM-006. */
  'cost.margin': { nameAr: 'عرض هامش الربح', group: 'التكلفة' },

  // Phase 6.5. Approval is separated from entry throughout: the person who
  // files a claim must not be the person who lets it count against profit.
  'expenses.view': { nameAr: 'عرض المصروفات الثانوية', group: 'المصروفات' },
  'expenses.write': { nameAr: 'تسجيل المصروفات الثانوية', group: 'المصروفات' },
  'expenses.approve': { nameAr: 'اعتماد المصروفات الثانوية', group: 'المصروفات' },

  'damage.view': { nameAr: 'عرض محاضر الهالك', group: 'الهالك والجزاءات' },
  'damage.write': { nameAr: 'تسجيل محاضر الهالك', group: 'الهالك والجزاءات' },
  'damage.approve': { nameAr: 'اعتماد محاضر الهالك', group: 'الهالك والجزاءات' },
  /** Deliberately its own key — a penalty takes money from a person. */
  'penalties.approve': { nameAr: 'اعتماد وتحصيل الجزاءات', group: 'الهالك والجزاءات' },

  'supplies.view': { nameAr: 'عرض مستلزمات الطباعة والتطريز', group: 'المستلزمات' },
  'supplies.write': { nameAr: 'تسجيل حركات المستلزمات', group: 'المستلزمات' },

  // Phase 9. Receiving is separated from ordering on purpose: the person who
  // decides what to buy should not also be the one who certifies it arrived.
  'purchasing.view': { nameAr: 'عرض أوامر الشراء', group: 'المشتريات' },
  'purchasing.write': { nameAr: 'إنشاء وتعديل أوامر الشراء', group: 'المشتريات' },
  'purchasing.confirm': { nameAr: 'تأكيد وإلغاء أوامر الشراء', group: 'المشتريات' },
  'purchasing.receive': { nameAr: 'استلام البضاعة من المورّد', group: 'المشتريات' },

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
    'sales.documents',
    'sales.write',
    'sales.confirm',
    'products.read',
    'products.write',
    'catalog.manage',
    'customers.read',
    'customers.write',
    'suppliers.read',
    'suppliers.write',
    'inventory.read',
    'inventory.write',
    'manufacturing.view',
    'manufacturing.write',
    'manufacturing.confirm',
    'formula.view',
    'formula.write',
    'cost.view',
    'cost.margin',
    'expenses.view',
    'expenses.write',
    'expenses.approve',
    'damage.view',
    'damage.write',
    'damage.approve',
    'penalties.approve',
    'supplies.view',
    'supplies.write',
    'purchasing.view',
    'purchasing.write',
    'purchasing.confirm',
    'purchasing.receive',
    'reports.view',
  ],

  SALES: [
    'sales.view',
    'sales.documents',
    'sales.write',
    'sales.confirm',
    'products.read',
    'customers.read',
    'customers.write',
    'suppliers.read',
    'inventory.read',
    'cost.view',
    'reports.view',
    // A representative files their own travel and fuel claims, and cannot
    // approve them. Entry without approval is the whole point.
    'expenses.view',
    'expenses.write',
    // Deliberately NOT cost.margin — a representative sees cost to quote
    // sensibly, but company margin is not theirs to see.
    // Deliberately NOT formula.view either — the cost is what they need to
    // quote; the recipe that produces it is manufacturing know-how.
    // Deliberately NOT damage or penalties — those concern staff conduct.
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
