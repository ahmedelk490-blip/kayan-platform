import 'server-only';

import { gzipSync } from 'node:zlib';
import { mkdir, readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { prisma } from './prisma';

/**
 * نسخ احتياطي تلقائي لقاعدة البيانات — صمام الأمان الغائب.
 *
 * كل الفواتير والمخزون في قاعدة واحدة على الاستضافة بلا نسخ مجدول. الآلية:
 * أول طلب مسجَّل بعد مرور ~يوم على آخر نسخة يطلق تصديراً كاملاً في الخلفية —
 * لا كرون يحتاج إعداداً، والنظام يُستخدم يومياً فالنسخ يومي عملياً.
 *
 * الملفات JSON مضغوط في مجلد خارج مجلد النشر (يبقى بين النشرات)، وتُبقى
 * آخر ٣٠ نسخة. الاستعادة: فك الضغط، ولكل جدول INSERT من صفوفه.
 */

const DIR = process.env.BACKUP_DIR ?? path.join(process.env.HOME ?? os.homedir(), 'kayan-backups');
const KEEP = 30;
/** ٢٠ ساعة لا ٢٤: لو تأخر أول طلب صباحاً لا تنزلق النسخة يوماً كاملاً. */
const EVERY_MS = 20 * 60 * 60 * 1000;
const PROBE_MS = 10 * 60 * 1000;

let lastProbe = 0;

/**
 * يفحص (بحد أقصى كل ١٠ دقائق) هل حان وقت نسخة، ويطلقها في الخلفية دون
 * انتظار — لا يبطئ أي طلب ولا يُسقطه مهما فشل.
 */
export function maybeBackup(): void {
  const now = Date.now();
  if (now - lastProbe < PROBE_MS) return;
  lastProbe = now;

  void (async () => {
    try {
      await mkdir(DIR, { recursive: true });
      const marker = path.join(DIR, 'last-run.txt');
      let last = 0;
      try {
        last = Number(await readFile(marker, 'utf8')) || 0;
      } catch {
        /* لا نسخة سابقة */
      }
      if (now - last < EVERY_MS) return;
      // احجز الدور قبل البدء — طلبان متزامنان لا يطلقان نسختين.
      await writeFile(marker, String(now));
      await runBackup();
    } catch {
      /* النسخ الاحتياطي لا يُسقط طلباً أبداً */
    }
  })();
}

/** تصدير كل الجداول إلى ملف JSON مضغوط، مع تدوير أقدم النسخ. */
export async function runBackup(): Promise<{ file: string; tables: number; rows: number }> {
  const tableRows = await prisma.$queryRawUnsafe<Record<string, string>[]>('SHOW TABLES');
  const names = tableRows
    .map((r) => String(Object.values(r)[0]))
    .filter((n) => !n.startsWith('_'));

  const dump: Record<string, unknown[]> = {};
  let rows = 0;
  for (const t of names) {
    const data = await prisma.$queryRawUnsafe<unknown[]>(`SELECT * FROM \`${t}\``);
    dump[t] = data;
    rows += data.length;
  }

  const iraq = new Date(Date.now() + 3 * 60 * 60 * 1000);
  const stamp = iraq.toISOString().slice(0, 16).replace(/[T:]/g, '-');
  const file = path.join(DIR, `kayan-backup-${stamp}.json.gz`);

  await mkdir(DIR, { recursive: true });
  const json = JSON.stringify(dump, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
  await writeFile(file, gzipSync(Buffer.from(json)));

  // تدوير: أبقِ آخر KEEP ملفات فقط.
  const files = (await readdir(DIR)).filter((f) => f.startsWith('kayan-backup-')).sort();
  for (const f of files.slice(0, Math.max(0, files.length - KEEP))) {
    try {
      await unlink(path.join(DIR, f));
    } catch {
      /* ملف عصيّ على الحذف لا يوقف النسخ */
    }
  }

  return { file, tables: names.length, rows };
}

/** آخر النسخ الموجودة — لعرضها في شاشة الإدارة. */
/** أحدث ملف نسخة مع محتواه — للتنزيل من شاشة الإدارة (نسخة بيد المالك خارج الخادم). */
export async function latestBackup(): Promise<{ name: string; data: Buffer } | null> {
  try {
    const files = (await readdir(DIR)).filter((f) => f.startsWith('kayan-backup-')).sort();
    const name = files[files.length - 1];
    if (!name) return null;
    return { name, data: await readFile(path.join(DIR, name)) };
  } catch {
    return null;
  }
}

export async function listBackups(): Promise<{ name: string; size: number; mtime: Date }[]> {
  try {
    const files = (await readdir(DIR))
      .filter((f) => f.startsWith('kayan-backup-'))
      .sort()
      .reverse()
      .slice(0, 10);
    return await Promise.all(
      files.map(async (f) => {
        const s = await stat(path.join(DIR, f));
        return { name: f, size: s.size, mtime: s.mtime };
      }),
    );
  } catch {
    return [];
  }
}
