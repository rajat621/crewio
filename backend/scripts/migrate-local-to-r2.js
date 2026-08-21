/**
 * One-time migration: local disk -> Cloudflare R2.
 *
 * Run this AFTER you've:
 *   1. Created the R2 bucket and filled in R2_* vars in .env
 *   2. Set STORAGE_DRIVER=r2 in .env
 *   3. npm install (to pull in @aws-sdk/client-s3)
 *
 * Usage:
 *   node scripts/migrate-local-to-r2.js            # does the migration
 *   node scripts/migrate-local-to-r2.js --dry-run   # lists what it WOULD do, changes nothing
 *
 * What it does:
 *   - Walks every FileRecord in Mongo, uploads its local file to R2 under
 *     companies/{companyId}/{purpose}/{filename} (or owners/{ownerId}/... if
 *     the record has no companyId yet), and updates that FileRecord's
 *     storageDriver/storageKey/path to point at R2.
 *   - Does the same for every Invoice with a generated_invoice_pdf that's
 *     still a local path, scoped under owners/{ownerId}/invoices/.
 *   - Leaves the original local files in place (does NOT delete them) so
 *     you can verify everything migrated correctly before cleaning up
 *     src/storage/ yourself.
 */
import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import env from '../src/config/env.js';
import { connectDB } from '../src/config/db.js';
import FileRecord from '../src/models/FileRecord.js';
import { Invoice } from '../src/models/Invoice.js';
import { saveLocalFile } from '../src/services/storage.service.js';

const DRY_RUN = process.argv.includes('--dry-run');
const storageRoot = path.resolve(process.cwd(), 'src', 'storage');

const resolveLocalPath = (webPath) => {
  if (!webPath || typeof webPath !== 'string') return null;
  const rel = webPath.startsWith('/') ? webPath.slice(1) : webPath;
  return path.join(storageRoot, rel.replace(/^src\/storage\//, ''));
};

async function migrateFileRecords() {
  const records = await FileRecord.find({ storageDriver: { $ne: 'r2' } }).lean();
  console.log(`FileRecord: ${records.length} local record(s) to migrate`);

  let migrated = 0;
  let skipped = 0;

  for (const rec of records) {
    const absPath = resolveLocalPath(rec.path);
    if (!absPath || !fs.existsSync(absPath)) {
      console.warn(`  SKIP ${rec._id}: local file not found at ${absPath}`);
      skipped += 1;
      continue;
    }

    const folder = rec.purpose || 'misc';
    const filename = rec.originalName ? `${rec._id}-${rec.originalName}` : path.basename(absPath);

    if (DRY_RUN) {
      console.log(`  [dry-run] would upload ${absPath} -> companies/${rec.companyId || 'owners/' + rec.ownerId}/${folder}/${filename}`);
      migrated += 1;
      continue;
    }

    const saved = await saveLocalFile({
      absolutePath: absPath,
      companyId: rec.companyId,
      ownerId: rec.ownerId,
      folder,
      filename,
    });

    await FileRecord.updateOne(
      { _id: rec._id },
      { $set: { storageDriver: saved.driver, storageKey: saved.key, path: saved.path } }
    );
    migrated += 1;
  }

  console.log(`FileRecord: migrated ${migrated}, skipped ${skipped}`);
}

async function migrateInvoicePdfs() {
  const invoices = await Invoice.find({
    generated_invoice_pdf: { $regex: '^/(storage|invoices)' },
  }).lean();
  console.log(`Invoice: ${invoices.length} local PDF(s) to migrate`);

  let migrated = 0;
  let skipped = 0;

  for (const inv of invoices) {
    const absPath = resolveLocalPath(inv.generated_invoice_pdf);
    if (!absPath || !fs.existsSync(absPath)) {
      console.warn(`  SKIP invoice ${inv._id}: local file not found at ${absPath}`);
      skipped += 1;
      continue;
    }

    const filename = `${inv.invoiceNumber || inv._id}.pdf`;

    if (DRY_RUN) {
      console.log(`  [dry-run] would upload ${absPath} -> owners/${inv.ownerId}/invoices/${filename}`);
      migrated += 1;
      continue;
    }

    const saved = await saveLocalFile({
      absolutePath: absPath,
      companyId: null,
      ownerId: inv.ownerId,
      folder: 'invoices',
      filename,
    });

    await Invoice.updateOne(
      { _id: inv._id },
      { $set: { generated_invoice_pdf: saved.path, pdfUrl: saved.path } }
    );
    migrated += 1;
  }

  console.log(`Invoice: migrated ${migrated}, skipped ${skipped}`);
}

async function main() {
  if (env.storage.driver !== 'r2' && !DRY_RUN) {
    console.error('STORAGE_DRIVER is not "r2" in your .env - set it before running this for real.');
    console.error('(You can still run with --dry-run to preview without that set.)');
    process.exit(1);
  }

  await connectDB();
  console.log(DRY_RUN ? '--- DRY RUN: no changes will be made ---' : '--- Migrating local files to R2 ---');

  await migrateFileRecords();
  await migrateInvoicePdfs();

  console.log('Done. Original local files were left in place - verify in R2 before deleting src/storage/.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
