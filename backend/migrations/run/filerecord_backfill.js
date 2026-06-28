import { connectDB } from '../../src/config/db.js';
import FileRecord from '../../src/models/FileRecord.js';
import fs from 'fs';
import path from 'path';
import MigrationLog from '../../src/models/MigrationLog.js';

const PLAN_PATH = path.resolve(process.cwd(), 'scripts', 'file_record_migration_plan.json');
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '200', 10);
const MIGRATION_NAME = 'filerecord_backfill_v1';
const EXECUTED_BY = process.env.MIGRATION_EXECUTOR || 'migration-tool';

async function run() {
  await connectDB();
  if (!fs.existsSync(PLAN_PATH)) {
    console.error('File record plan not found at', PLAN_PATH);
    process.exit(1);
  }
  const plan = JSON.parse(fs.readFileSync(PLAN_PATH, 'utf8'));
  const items = plan.plan || [];
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    for (const it of batch) {
      // Skip if FileRecord already exists for path
      const exists = await FileRecord.findOne({ path: it.filePath }).lean();
      if (exists) continue;

      const doc = {
        ownerId: it.derivedOwnerId || null,
        companyId: it.derivedCompanyId || null,
        uploadedBy: it.suggestedFileRecord.uploadedBy || null,
        originalName: it.filename,
        mimeType: null,
        size: null,
        path: it.filePath,
        purpose: it.suggestedFileRecord.purpose || 'unknown',
        metadata: it.suggestedFileRecord.metadata || {},
      };

      const created = await FileRecord.create(doc);
      await MigrationLog.create({ migrationName: MIGRATION_NAME, collection: 'FileRecord', documentId: created._id, before: null, after: created.toObject(), executedBy: EXECUTED_BY });
    }
    console.log(`Processed filerecord batch ${i}-${i + BATCH_SIZE}`);
  }
  console.log('FileRecord backfill completed');
  process.exit(0);
}

run().catch((err) => { console.error(err); process.exit(1); });
