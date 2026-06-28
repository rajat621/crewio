import { connectDB } from '../../src/config/db.js';
import Employee from '../../src/models/Employee.js';
import MigrationLog from '../../src/models/MigrationLog.js';

const MIGRATION_NAME = 'employee_ownerid_backfill_v1';
const EXECUTED_BY = process.env.MIGRATION_EXECUTOR || 'migration-tool';

async function run() {
  await connectDB();
  const logs = await MigrationLog.find({ migrationName: MIGRATION_NAME }).sort({ executedAt: -1 }).lean();
  for (const l of logs) {
    const docId = l.documentId;
    const beforeOwner = l.before && l.before.ownerId !== undefined ? l.before.ownerId : null;
    await Employee.updateOne({ _id: docId }, { $set: { ownerId: beforeOwner } });
    console.log(`Reverted Employee ${docId} -> ownerId=${beforeOwner}`);
  }
  console.log('Employee rollback completed');
  process.exit(0);
}

run().catch((err) => { console.error(err); process.exit(1); });
