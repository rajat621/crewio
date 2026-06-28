import { connectDB } from '../../src/config/db.js';
import Attendance from '../../src/models/Attendance.js';
import MigrationLog from '../../src/models/MigrationLog.js';

const MIGRATION_NAME = 'attendance_ownerid_backfill_v1';

async function run() {
  await connectDB();
  const logs = await MigrationLog.find({ migrationName: MIGRATION_NAME }).sort({ executedAt: -1 }).lean();
  for (const l of logs) {
    const docId = l.documentId;
    const beforeOwner = l.before && l.before.ownerId !== undefined ? l.before.ownerId : null;
    await Attendance.updateOne({ _id: docId }, { $set: { ownerId: beforeOwner } });
    console.log(`Reverted Attendance ${docId} -> ownerId=${beforeOwner}`);
  }
  console.log('Attendance rollback completed');
  process.exit(0);
}

run().catch((err) => { console.error(err); process.exit(1); });
