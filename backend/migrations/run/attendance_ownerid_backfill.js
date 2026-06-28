import { connectDB } from '../../src/config/db.js';
import Attendance from '../../src/models/Attendance.js';
import Employee from '../../src/models/Employee.js';
import Company from '../../src/models/Company.js';
import MigrationLog from '../../src/models/MigrationLog.js';

const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '500', 10);
const MIGRATION_NAME = 'attendance_ownerid_backfill_v1';
const EXECUTED_BY = process.env.MIGRATION_EXECUTOR || 'migration-tool';

async function processBatch(skip) {
  const docs = await Attendance.find({ $or: [{ ownerId: { $exists: false } }, { ownerId: null }] }).skip(skip).limit(BATCH_SIZE).lean();
  if (!docs.length) return 0;

  for (const doc of docs) {
    if (!doc.employee) {
      // cannot derive
      continue;
    }
    const emp = await Employee.findById(doc.employee).select('owner company').lean();
    if (!emp) continue;
    let derived = emp.owner || null;
    if (!derived && emp.company) {
      const c = await Company.findById(emp.company).select('owner').lean();
      if (c && c.owner) derived = c.owner;
    }
    if (!derived) continue;

    const before = { ownerId: doc.ownerId || null };
    const res = await Attendance.updateOne({ _id: doc._id, $or: [{ ownerId: { $exists: false } }, { ownerId: null }] }, { $set: { ownerId: derived } });
    if (res.modifiedCount || res.nModified) {
      const after = { ownerId: derived };
      await MigrationLog.create({ migrationName: MIGRATION_NAME, collection: 'Attendance', documentId: doc._id, before, after, executedBy: EXECUTED_BY });
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
    console.log(`Processed ${skip} attendance records...`);
  }
  console.log('Attendance ownerId backfill completed');
  process.exit(0);
}

run().catch((err) => { console.error(err); process.exit(1); });
