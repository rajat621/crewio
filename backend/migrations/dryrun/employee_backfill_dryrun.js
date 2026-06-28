import { connectDB } from '../../src/config/db.js';
import Employee from '../../src/models/Employee.js';
import Company from '../../src/models/Company.js';
import fs from 'fs';
import path from 'path';

async function run() {
  await connectDB();
  const employees = await Employee.find({}).lean();
  const ops = [];
  for (const e of employees) {
    // Derive ownerId from existing `owner` field if present
    if (e.owner && !e.ownerId) {
      ops.push({
        filter: { _id: e._id },
        update: { $set: { ownerId: e.owner } },
        derivedFrom: 'owner',
        confidence: 'HIGH',
      });
    } else if (!e.owner && e.company && !e.ownerId) {
      // fallback: company.owner
      const c = await Company.findById(e.company).select('owner').lean();
      if (c && c.owner) {
        ops.push({
          filter: { _id: e._id },
          update: { $set: { ownerId: c.owner } },
          derivedFrom: 'company.owner',
          confidence: 'MEDIUM',
        });
      }
    }
  }

  const out = path.resolve(process.cwd(), 'migrations', 'dryrun', 'employee_backfill_ops.json');
  fs.writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), operations: ops, sampleCount: Math.min(10, ops.length) }, null, 2));
  console.log('Employee dry-run operations written to', out);
  process.exit(0);
}

run().catch((err) => { console.error(err); process.exit(1); });
