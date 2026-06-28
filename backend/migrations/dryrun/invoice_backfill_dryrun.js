import { connectDB } from '../../src/config/db.js';
import { Invoice } from '../../src/models/Invoice.js';
import Company from '../../src/models/Company.js';
import User from '../../src/models/User.js';
import fs from 'fs';
import path from 'path';

async function run() {
  await connectDB();
  const invoices = await Invoice.find({}).lean();
  const ops = [];
  for (const inv of invoices) {
    // Rule: Invoice -> company -> ownerId ; fallback createdBy
    const companyId = inv.company || null;
    let companyOwner = null;
    if (companyId) {
      const c = await Company.findById(companyId).select('owner').lean();
      companyOwner = c && c.owner ? c.owner : null;
    }

    // If companyOwner missing, try createdBy -> User -> owner
    if (!companyOwner && inv.createdBy) {
      const u = await User.findById(inv.createdBy).select('owner company').lean();
      if (u && u.owner) {
        companyOwner = u.owner;
      }
    }

    if (companyOwner) {
      ops.push({ filter: { _id: inv._id }, update: { $set: { ownerId: companyOwner } }, derivedFrom: 'company.owner|createdBy', confidence: 'HIGH', companyId, companyOwner });
    } else if (inv.createdBy) {
      ops.push({ filter: { _id: inv._id }, update: { $set: { ownerId: inv.createdBy } }, derivedFrom: 'createdBy', confidence: 'MEDIUM', companyId, companyOwner });
    } else {
      ops.push({ filter: { _id: inv._id }, update: {}, derivedFrom: 'none', confidence: 'UNKNOWN', companyId, companyOwner });
    }
  }

  const out = path.resolve(process.cwd(), 'migrations', 'dryrun', 'invoice_backfill_ops.json');
  fs.writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), operations: ops, sampleCount: Math.min(10, ops.length) }, null, 2));
  console.log('Invoice dry-run operations written to', out);
  process.exit(0);
}

run().catch((err) => { console.error(err); process.exit(1); });
