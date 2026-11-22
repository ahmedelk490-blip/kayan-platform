import { timingSafeEqual } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { MCP_TOOLS, runMcpTool } from '@/lib/mcp-tools';

/**
 * «ربط Claude» — خادم MCP بسيط (Streamable HTTP بلا حالة، JSON فقط) يضيفه
 * المالك في claude.ai ← Settings ← Connectors برابطٍ فيه مفتاحه السرّي.
 * المفتاح يُولَّد ويُبدَّل من «ربط Claude» في الإدارة، وكل الأدوات قراءة فقط.
 */
export const dynamic = 'force-dynamic';

const KEY = 'claude_mcp_key';

type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };

async function tenantForKey(key: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{24,}$/.test(key)) return null;
  const rows = await prisma.siteContent.findMany({ where: { key: KEY }, select: { tenantId: true, valueAr: true } });
  for (const r of rows) {
    const a = Buffer.from(r.valueAr);
    const b = Buffer.from(key);
    if (a.length === b.length && timingSafeEqual(a, b)) return r.tenantId;
  }
  return null;
}

async function handle(tenantId: string, msg: Rpc): Promise<object | null> {
  const id = msg.id ?? null;
  const ok = (result: unknown) => ({ jsonrpc: '2.0', id, result });
  const fail = (code: number, message: string) => ({ jsonrpc: '2.0', id, error: { code, message } });
  if (!msg.method) return fail(-32600, 'Invalid request');
  if (msg.method.startsWith('notifications/')) return null;
  switch (msg.method) {
    case 'initialize':
      return ok({
        protocolVersion: typeof msg.params?.protocolVersion === 'string' ? msg.params.protocolVersion : '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'kayan-erp', version: '1.0.0' },
        instructions:
          'نظام كيان للزي الموحد (العراق). أدوات قراءة فقط للمبيعات والأرباح والمصروفات والمخزون والديون. المبالغ بالدينار العراقي، والتواريخ YYYY-MM-DD بتوقيت بغداد.',
      });
    case 'ping':
      return ok({});
    case 'tools/list':
      return ok({ tools: MCP_TOOLS });
    case 'tools/call': {
      const name = String(msg.params?.name ?? '');
      const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
      try {
        const data = await runMcpTool(tenantId, name, args);
        return ok({ content: [{ type: 'text', text: JSON.stringify(data, null, 1) }] });
      } catch (e) {
        return ok({ content: [{ type: 'text', text: e instanceof Error ? e.message : 'خطأ' }], isError: true });
      }
    }
    default:
      return fail(-32601, `Method not found: ${msg.method}`);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const tenantId = await tenantForKey(key);
  if (!tenantId) return new Response('Not found', { status: 404 });
  let body: Rpc | Rpc[];
  try {
    body = (await req.json()) as Rpc | Rpc[];
  } catch {
    return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, { status: 400 });
  }
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map((m) => handle(tenantId, m)))).filter(Boolean);
    return out.length ? Response.json(out) : new Response(null, { status: 202 });
  }
  const res = await handle(tenantId, body);
  return res ? Response.json(res) : new Response(null, { status: 202 });
}

export async function GET() {
  return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
}

export async function DELETE() {
  return new Response(null, { status: 405 });
}
