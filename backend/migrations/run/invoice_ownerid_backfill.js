import { connectDB } from '../../src/config/db.js';
import { Invoice } from '../../src/models/Invoice.js';
import Company from '../../src/models/Company.js';
import User from '../../src/models/User.js';
import MigrationLog from '../../src/models/MigrationLog.js';

const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '500', 10);
const MIGRATION_NAME = 'invoice_ownerid_backfill_v1';
const EXECUTED_BY = process.env.MIGRATION_EXECUTOR || 'migration-tool';

async function processBatch(skip) {
  const docs = await Invoice.find({ $or: [{ ownerId: { $exists: false } }, { ownerId: null }] }).skip(skip).limit(BATCH_SIZE).lean();
  if (!docs.length) return 0;

  for (const inv of docs) {
    let derived = null;
    if (inv.company) {
      const c = await Company.findById(inv.company).select('owner').lean();
      if (c && c.owner) derived = c.owner;
    }
    if (!derived && inv.createdBy) {
      const u = await User.findById(inv.createdBy).select('owner').lean();
      if (u && u.owner) derived = u.owner;
      else derived = inv.createdBy; // fallback to createdBy
    }
    if (!derived) continue;

    const before = { ownerId: inv.ownerId || null };
    const res = await Invoice.updateOne({ _id: inv._id, $or: [{ ownerId: { $exists: false } }, { ownerId: null }] }, { $set: { ownerId: derived } });
    if (res.modifiedCount || res.nModified) {
      const after = { ownerId: derived };
      await MigrationLog.create({ migrationName: MIGRATION_NAME, collection: 'Invoice', documentId: inv._id, before, after, executedBy: EXECUTED_BY });
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
    console.log(`Processed ${skip} invoices...`);
  }
  console.log('Invoice ownerId backfill completed');
  process.exit(0);
}

run().catch((err) => { console.error(err); process.exit(1); });
