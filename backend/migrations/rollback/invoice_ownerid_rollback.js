import { connectDB } from '../../src/config/db.js';
import { Invoice } from '../../src/models/Invoice.js';
import MigrationLog from '../../src/models/MigrationLog.js';

const MIGRATION_NAME = 'invoice_ownerid_backfill_v1';

async function run() {
  await connectDB();
  const logs = await MigrationLog.find({ migrationName: MIGRATION_NAME }).sort({ executedAt: -1 }).lean();
  for (const l of logs) {
    const docId = l.documentId;
    const beforeOwner = l.before && l.before.ownerId !== undefined ? l.before.ownerId : null;
    await Invoice.updateOne({ _id: docId }, { $set: { ownerId: beforeOwner } });
    console.log(`Reverted Invoice ${docId} -> ownerId=${beforeOwner}`);
  }
  console.log('Invoice rollback completed');
  process.exit(0);
}

run().catch((err) => { console.error(err); process.exit(1); });
