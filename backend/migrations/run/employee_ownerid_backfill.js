import { connectDB } from '../../src/config/db.js';
import Employee from '../../src/models/Employee.js';
import Company from '../../src/models/Company.js';
import MigrationLog from '../../src/models/MigrationLog.js';

const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '500', 10);
const MIGRATION_NAME = 'employee_ownerid_backfill_v1';
const EXECUTED_BY = process.env.MIGRATION_EXECUTOR || 'migration-tool';

async function processBatch(skip) {
  const docs = await Employee.find({ $or: [{ ownerId: { $exists: false } }, { ownerId: null }] }).skip(skip).limit(BATCH_SIZE).lean();
  if (!docs.length) return 0;

  for (const doc of docs) {
    // Derive ownerId
    let derived = null;
    if (doc.owner) derived = doc.owner; // existing owner field
    else if (doc.company) {
      const c = await Company.findById(doc.company).select('owner').lean();
      if (c && c.owner) derived = c.owner;
    }

    if (!derived) continue; // skip, manual review

    // Idempotent update: only set if ownerId missing
    const before = { ownerId: doc.ownerId || null };
    const res = await Employee.updateOne({ _id: doc._id, $or: [{ ownerId: { $exists: false } }, { ownerId: null }] }, { $set: { ownerId: derived } });
    if (res.modifiedCount || res.nModified) {
      const after = { ownerId: derived };
      await MigrationLog.create({ migrationName: MIGRATION_NAME, collection: 'Employee', documentId: doc._id, before, after, executedBy: EXECUTED_BY });
    }
  }
  return docs.length;
}

async function run() {
  await connectDB();
  let skip = 0;
  while (true) {
    const processed = await processBatch(skip);
    if (!processed) break;
    skip += processed;
    console.log(`Processed ${skip} employees...`);
  }
  console.log('Employee ownerId backfill completed');
  process.exit(0);
}

run().catch((err) => { console.error(err); process.exit(1); });
