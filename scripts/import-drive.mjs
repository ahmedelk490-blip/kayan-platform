/**
 * Import KAYAN product imagery from Google Drive.
 *
 * The Drive tree is: category → model → images.
 * Each category becomes a Category, each model a Product, each PNG a
 * ProductImage converted to WebP.
 *
 * Why raw HTML rather than the Drive API: the folder is public and
 * unauthenticated, and Drive embeds every child id in the server-rendered
 * HTML. That avoids an API key and an OAuth dance for read-only public data.
 *
 * Idempotent — re-running updates rather than duplicating, matching on the
 * Drive file id.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import sharp from 'sharp';

const prisma = new PrismaClient();

const TENANT_ID = 'kayan';
const OUT_ROOT = path.join(process.cwd(), 'apps', 'web', 'public', 'products');
const MARKETING_ROOT = path.join(process.cwd(), 'apps', 'marketing', 'public', 'products');

/** Max images per product. The full set is hundreds of 2 MB PNGs. */
const MAX_IMAGES_PER_PRODUCT = 6;
const MAX_EDGE = 1400;
const WEBP_QUALITY = 82;

const CATEGORIES = [
  { slug: 'aprons', nameAr: 'المرايل', nameEn: 'Aprons', driveFolderId: '1TAG0GmZ7VhL6vLar11CSlzBPSwQ270_V' },
  { slug: 'tshirts', nameAr: 'التيشيرتات', nameEn: 'T-Shirts', driveFolderId: '1AYakFI8nsj53I8BioqLuM2gIZi2anRr1' },
  { slug: 'shemagh', nameAr: 'الشفقات', nameEn: 'Shemagh', driveFolderId: '1ThEX4sL7lsZ6DjfXUhbCtMG7gECTGm0R' },
  { slug: 'vest-turkish', nameAr: 'يلك تركي', nameEn: 'Turkish Vest', driveFolderId: '18LhRQjpBs5dHjatoPEhQgLs5o_o5uz7n' },
  { slug: 'vest-chinese', nameAr: 'يلك صيني', nameEn: 'Chinese Vest', driveFolderId: '10tv9QoG-uGEMYU2_X_uQ588_94bA2GqK' },
];

/**
 * Drive ids are exactly 33 chars starting with '1'. The page also contains
 * SVG path data that can look similar, so ids are additionally required to
 * carry both cases and a digit — path data never does.
 */
function extractChildren(html, parentId) {
  const ids = new Set();
  for (const match of html.matchAll(/data-id="(1[-\w]{32})"/g)) {
    const id = match[1];
    if (id === parentId) continue;
    ids.add(id);
  }
  return [...ids];
}

/** Pull "id → name" pairs out of the row markup. */
function extractNamed(html, parentId) {
  const named = new Map();
  const rowPattern = /data-id="(1[-\w]{32})"[\s\S]{0,4000}?aria-label="([^"]{1,120})"/g;
  for (const match of rowPattern.exec ? html.matchAll(rowPattern) : []) {
    const [, id, label] = match;
    if (id === parentId) continue;
    if (!named.has(id)) named.set(id, label.replace(/\s+/g, ' ').trim());
  }
  for (const id of extractChildren(html, parentId)) {
    if (!named.has(id)) named.set(id, id);
  }
  return named;
}

async function fetchFolder(id) {
  const res = await fetch(`https://drive.google.com/drive/folders/${id}`, {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; KayanImporter/1.0)' },
  });
  if (!res.ok) throw new Error(`folder ${id} → HTTP ${res.status}`);
  return res.text();
}

async function downloadFile(id) {
  const res = await fetch(`https://drive.google.com/uc?export=download&id=${id}`, {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; KayanImporter/1.0)' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`file ${id} → HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  // A folder id returns an HTML error page, not an image.
  if (buffer.subarray(0, 5).toString() === '<!DOC') throw new Error(`file ${id} is not an image`);
  return buffer;
}

/**
 * Drive's aria-labels carry UI chrome alongside the name — owner, date, and
 * "Shared folder". Strip all of it, or product names ship with Google's
 * interface text embedded in them.
 */
function cleanName(raw, fallback) {
  const stripped = raw
    .replace(/المالك مخفيّ.*$/u, '')
    .replace(/\bShared (folder|item|file)\b/gi, '')
    .replace(/\bمجلد تمت مشاركته\b/gu, '')
    .replace(/\b\d{1,2}\s*(أغسطس|يوليو|سبتمبر|يونيو)\b/gu, '')
    .replace(/[—–-]\s*$/u, '')
    .replace(/\s+/g, ' ')
    .trim();

  return stripped.length > 1 && !/^1[-\w]{32}$/.test(stripped) ? stripped : fallback;
}

async function main() {
  const summary = { categories: 0, products: 0, images: 0, skipped: 0, errors: [] };

  await mkdir(OUT_ROOT, { recursive: true });
  await mkdir(MARKETING_ROOT, { recursive: true });

  for (const [index, definition] of CATEGORIES.entries()) {
    process.stdout.write(`\n[${definition.slug}] `);

    const category = await prisma.category.upsert({
      where: { tenantId_slug: { tenantId: TENANT_ID, slug: definition.slug } },
      update: { nameAr: definition.nameAr, nameEn: definition.nameEn, sortOrder: index },
      create: {
        tenantId: TENANT_ID,
        slug: definition.slug,
        nameAr: definition.nameAr,
        nameEn: definition.nameEn,
        driveFolderId: definition.driveFolderId,
        sortOrder: index,
      },
    });
    summary.categories += 1;

    let modelHtml;
    try {
      modelHtml = await fetchFolder(definition.driveFolderId);
    } catch (error) {
      summary.errors.push(`${definition.slug}: ${error.message}`);
      continue;
    }

    const children = extractNamed(modelHtml, definition.driveFolderId);

    /**
     * The tree is NOT uniform, which the first import run proved: t-shirts
     * and the Turkish vest nest images inside model folders, while aprons,
     * shemagh and the Chinese vest hold images directly in the category.
     * Probe the first child rather than assuming a shape.
     */
    const [firstChildId] = [...children.keys()];
    let nested = false;
    if (firstChildId) {
      try {
        await fetchFolder(firstChildId);
        nested = true;
      } catch {
        nested = false;
      }
    }

    const models = nested
      ? [...children].map(([id, name]) => ({ id, name }))
      : [{ id: definition.driveFolderId, name: definition.nameAr }];

    process.stdout.write(nested ? `${models.length} model(s) ` : `flat, ${children.size} file(s) `);

    let modelIndex = 0;
    for (const model of models) {
      modelIndex += 1;
      const modelId = model.id;
      const productName = cleanName(model.name, `${definition.nameAr} ${modelIndex}`);
      const sku = `${definition.slug.toUpperCase()}-${String(modelIndex).padStart(3, '0')}`;

      let fileIds;
      if (nested) {
        try {
          const filesHtml = await fetchFolder(modelId);
          fileIds = extractChildren(filesHtml, modelId);
        } catch (error) {
          summary.errors.push(`${sku}: ${error.message}`);
          continue;
        }
      } else {
        fileIds = [...children.keys()];
      }

      fileIds = fileIds.slice(0, MAX_IMAGES_PER_PRODUCT);
      if (fileIds.length === 0) {
        summary.skipped += 1;
        continue;
      }

      const product = await prisma.product.upsert({
        where: { tenantId_sku: { tenantId: TENANT_ID, sku } },
        update: { nameAr: productName, categoryId: category.id },
        create: {
          tenantId: TENANT_ID,
          categoryId: category.id,
          sku,
          nameAr: productName,
          driveFolderId: modelId,
        },
      });
      summary.products += 1;

      const dir = path.join(OUT_ROOT, definition.slug, sku.toLowerCase());
      const marketingDir = path.join(MARKETING_ROOT, definition.slug, sku.toLowerCase());
      await mkdir(dir, { recursive: true });
      await mkdir(marketingDir, { recursive: true });

      for (const [fileIndex, fileId] of fileIds.entries()) {
        const existing = await prisma.productImage.findFirst({ where: { driveFileId: fileId } });
        if (existing) {
          summary.skipped += 1;
          continue;
        }

        try {
          const original = await downloadFile(fileId);
          const webp = await sharp(original)
            .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
            .webp({ quality: WEBP_QUALITY })
            .toBuffer();
          const meta = await sharp(webp).metadata();

          const filename = `${String(fileIndex + 1).padStart(2, '0')}.webp`;
          await writeFile(path.join(dir, filename), webp);
          await writeFile(path.join(marketingDir, filename), webp);

          await prisma.productImage.create({
            data: {
              productId: product.id,
              path: `/products/${definition.slug}/${sku.toLowerCase()}/${filename}`,
              width: meta.width ?? 0,
              height: meta.height ?? 0,
              bytes: webp.byteLength,
              isPrimary: fileIndex === 0,
              sortOrder: fileIndex,
              driveFileId: fileId,
            },
          });

          summary.images += 1;
          process.stdout.write('.');
        } catch (error) {
          summary.errors.push(`${sku}/${fileId}: ${error.message}`);
          process.stdout.write('x');
        }
      }
    }
  }

  console.log('\n\n--- import summary ---');
  console.log(`categories : ${summary.categories}`);
  console.log(`products   : ${summary.products}`);
  console.log(`images     : ${summary.images}`);
  console.log(`skipped    : ${summary.skipped}`);
  if (summary.errors.length) {
    console.log(`errors     : ${summary.errors.length}`);
    for (const e of summary.errors.slice(0, 10)) console.log(`   ${e}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
