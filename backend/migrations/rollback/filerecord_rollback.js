import { connectDB } from '../../src/config/db.js';
import FileRecord from '../../src/models/FileRecord.js';
import MigrationLog from '../../src/models/MigrationLog.js';

const MIGRATION_NAME = 'filerecord_backfill_v1';

async function run() {
  await connectDB();
  const logs = await MigrationLog.find({ migrationName: MIGRATION_NAME }).sort({ executedAt: -1 }).lean();
  for (const l of logs) {
    const docId = l.documentId;
    // simplest rollback: remove created filerecords
    await FileRecord.deleteOne({ _id: docId });
    console.log(`Deleted FileRecord ${docId}`);
  }
  console.log('FileRecord rollback completed');
  process.exit(0);
}

run().catch((err) => { console.error(err); process.exit(1); });
