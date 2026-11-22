import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader } from '@/components/crud/Shell';
import { ConfirmButton } from '@/components/crud/ConfirmButton';
import { CopyButton } from '@/components/crud/CopyButton';
import { MCP_TOOLS } from '@/lib/mcp-tools';
import { rotateClaudeKey, disableClaudeKey } from './actions';

export const metadata: Metadata = { title: 'ربط Claude' };

/**
 * «ربط Claude» — رابطٌ سرّي يضيفه المالك في claude.ai فيسأل Claude عن
 * الحسابات (قراءة فقط). المفتاح يُبدَّل أو يُوقف من هنا.
 */
export default async function ClaudeConnectPage() {
  const user = await requirePermission('settings.manage');
  const row = await prisma.siteContent.findFirst({
    where: { tenantId: user.tenantId, key: 'claude_mcp_key' },
    select: { valueAr: true },
  });
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'kayan-uniform.com';
  const url = row ? `https://${host}/api/mcp/${row.valueAr}` : null;

  return (
    <AppShell user={user} title="ربط Claude">
      <ModuleHeader title="ربط Claude بالحسابات" />
      <section className="erp-card mb-6 max-w-3xl space-y-4 p-6 text-sm leading-[1.9] text-txt-2">
        {url ? (
          <>
            <p className="font-medium text-txt">رابط الربط (سرّي — لا ترسله لأحد):</p>
            <div className="flex flex-wrap items-center gap-2">
              <code dir="ltr" className="break-all rounded-lg border border-line bg-card-2 px-3 py-2 text-xs">
                {url}
              </code>
              <CopyButton text={url} label="الرابط" />
            </div>
            <ol className="list-decimal space-y-1 ps-5 text-xs">
              <li>افتح claude.ai ← Settings ← Connectors ← Add custom connector.</li>
              <li>الاسم: «نظام كيان»، والرابط: الرابط أعلاه. اضغط Add.</li>
              <li>في أي محادثة اسأل مثلاً: «كم ربحنا هذا الشهر؟» أو «شنو أكثر لون يلك انباع؟».</li>
            </ol>
            <div className="flex flex-wrap gap-2 pt-2">
              <form action={rotateClaudeKey}>
                <ConfirmButton
                  label="تبديل المفتاح"
                  message="تبديل المفتاح يوقف الرابط القديم فوراً، وتحتاج تضيف الجديد في claude.ai. متأكد؟"
                  className="rounded-lg border border-line-2 px-3 py-1.5 text-xs text-txt-2 hover:border-brand"
                />
              </form>
              <form action={disableClaudeKey}>
                <ConfirmButton
                  label="إيقاف الربط"
                  message="إيقاف الربط؟ Claude لن يقدر يقرأ الحسابات حتى تولّد مفتاحاً جديداً."
                  className="rounded-lg border border-bad px-3 py-1.5 text-xs text-bad hover:bg-bad-soft"
                />
              </form>
            </div>
          </>
        ) : (
          <>
            <p>الربط غير مفعّل. اضغط «تفعيل الربط» ليتولّد رابطٌ سرّي تضيفه في claude.ai.</p>
            <form action={rotateClaudeKey}>
              <button type="submit" className="erp-btn">
                تفعيل الربط
              </button>
            </form>
          </>
        )}
      </section>
      <section className="erp-card max-w-3xl p-6">
        <h3 className="mb-3 text-sm font-semibold text-brand">ماذا يقدر Claude يقرأ (قراءة فقط)</h3>
        <ul className="space-y-1.5 text-xs leading-[1.9] text-txt-2">
          {MCP_TOOLS.map((t) => (
            <li key={t.name}>• {t.description}</li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-txt-4">لا يقدر Claude يعدّل أو يحذف أي شيء في النظام.</p>
      </section>
    </AppShell>
  );
}
