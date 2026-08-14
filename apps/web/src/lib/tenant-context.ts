import 'server-only';

import { cache } from 'react';
import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * مستأجر الطلب الحالي.
 *
 * ── لماذا `cache` من React وليس AsyncLocalStorage وحدها ────
 *
 * كانت هذه الوحدة تعتمد على `enterWith` وحدها، ولم تكن تصمد: الحارس يضبط
 * المستأجر ثم يعود، وReact يعرض الصفحة في سياق تنفيذ آخر، فيصل الاستعلام
 * إلى قاعدة البيانات بلا مستأجر — وسياسات RLS ترفضه **بحق**.
 *
 * النتيجة كانت صامتة وخطيرة: كل شاشة تعرض صفراً. لا خطأ ولا استثناء، فقط
 * "لا توجد سجلات" على نظام مليء بالبيانات. اكتُشف حين قال الموقع العام سبعة
 * منتجات وقالت شاشة المنتجات صفراً — من الجدول نفسه.
 *
 * `cache()` من React يعطي كائناً واحداً لكل طلب، ويعبر حدود العرض والإجراءات
 * الخادمية لأن Next يوفّره لكليهما. يبقى AsyncLocalStorage كطبقة ثانية
 * للمسارات التي لا يغطّيها `cache` (معالجات المسارات خارج شجرة العرض).
 *
 * لا شيء هنا يوسّع الصلاحيات: الاستعلام بلا مستأجر يبقى مرفوضاً من قاعدة
 * البيانات، وهو السلوك المقصود لا عطل يُلتفّ حوله.
 */
const store = new AsyncLocalStorage<string>();

/** حامل لكل طلب. `cache` يضمن كائناً واحداً طوال الطلب الواحد. */
const requestTenant = cache((): { id?: string } => ({}));

export function setCurrentTenant(tenantId: string): void {
  try {
    requestTenant().id = tenantId;
  } catch {
    // خارج سياق طلب React — تبقى AsyncLocalStorage.
  }
  store.enterWith(tenantId);
}

/**
 * غير معرّف قبل حلّ الجلسة — أثناء تسجيل الدخول مثلاً. على المستدعي ألا
 * يتجاوز ذلك: استعلام بلا مستأجر ترفضه قاعدة البيانات، وهو المقصود.
 */
export function currentTenant(): string | undefined {
  try {
    const fromRequest = requestTenant().id;
    if (fromRequest) return fromRequest;
  } catch {
    // تجاهُل: نعود إلى AsyncLocalStorage أدناه.
  }
  return store.getStore();
}
