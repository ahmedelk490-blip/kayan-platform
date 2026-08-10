/**
 * Write the deployment archives.
 *
 * Not Compress-Archive. Windows PowerShell 5.1 writes entry names with
 * BACKSLASH separators, which the ZIP specification does not allow — Linux
 * unzip then produces single files literally named `packages\brand\src\...`
 * instead of a directory tree, and the deploy fails in a way that looks like
 * a corrupt upload rather than a bad archive. Verified: the first attempt at
 * this bundle had exactly that defect.
 *
 * Entries are also written at the archive ROOT rather than inside a wrapper
 * folder, because Hostinger looks for package.json at the top of the upload.
 *
 * Uses only Node's built-in zlib — no dependency for a build-time tool.
 */
import { createWriteStream } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { deflateRaw, crc32 } from 'node:zlib';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const deflate = promisify(deflateRaw);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function walk(dir, base = dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full, base)));
    // Forward slashes, always — the ZIP spec requires them and this is the
    // whole reason this script exists.
    else out.push({ full, name: path.relative(base, full).split(path.sep).join('/') });
  }
  return out;
}

function dosTime(date) {
  const time = ((date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() / 2)) & 0xffff;
  const day =
    (((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()) & 0xffff;
  return { time, day };
}

async function writeZip(sourceDir, zipPath) {
  const files = await walk(sourceDir);
  const out = createWriteStream(zipPath);
  const central = [];
  let offset = 0;

  const write = (buf) =>
    new Promise((resolve) => {
      offset += buf.length;
      out.write(buf, resolve);
    });

  for (const file of files) {
    const data = await readFile(file.full);
    const compressed = await deflate(data);
    const crc = crc32(data);
    // UTF-8 filename flag (bit 11): the README has an Arabic name, and
    // without this flag it arrives mojibake on the server.
    const flags = 0x0800;
    const { time, day } = dosTime((await stat(file.full)).mtime);
    const name = Buffer.from(file.name, 'utf8');

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);

    const localOffset = offset;
    await write(local);
    await write(name);
    await write(compressed);

    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(flags, 8);
    dir.writeUInt16LE(8, 10);
    dir.writeUInt16LE(time, 12);
    dir.writeUInt16LE(day, 14);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(compressed.length, 20);
    dir.writeUInt32LE(data.length, 24);
    dir.writeUInt16LE(name.length, 28);
    dir.writeUInt32LE(0o644 << 16, 38); // sane permissions on extract
    dir.writeUInt32LE(localOffset, 42);
    central.push(Buffer.concat([dir, name]));
  }

  const centralOffset = offset;
  for (const buf of central) await write(buf);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(central.length, 8);
  end.writeUInt16LE(central.length, 10);
  end.writeUInt32LE(offset - centralOffset, 12);
  end.writeUInt32LE(centralOffset, 16);
  await write(end);

  await new Promise((resolve) => out.end(resolve));
  return files.length;
}

async function main() {
  for (const name of ['kayan-marketing', 'kayan-erp']) {
    const src = path.join(ROOT, 'dist-hostinger', name);
    const zip = path.join(ROOT, 'dist-hostinger', `${name}.zip`);
    const count = await writeZip(src, zip);
    const size = (await stat(zip)).size;
    console.log(`${name}.zip — ${count} files, ${(size / 1024 / 1024).toFixed(2)} MB`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
