import { connectDB } from '../../src/config/db.js';
import AttendanceImport from '../../src/models/AttendanceImport.js';
import Company from '../../src/models/Company.js';
import { Invoice } from '../../src/models/Invoice.js';
import User from '../../src/models/User.js';
import fs from 'fs';
import path from 'path';

async function run() {
  await connectDB();
  const imports = await AttendanceImport.find({}).lean();
  const ops = [];
  for (const imp of imports) {
    if (imp.company) {
      const companyId = imp.company;
      const c = await Company.findById(companyId).select('owner').lean();
      let companyOwner = c && c.owner ? c.owner : null;

      // Fallback: if company.owner missing, try linked invoice -> company -> owner
      if (!companyOwner && imp.invoice) {
        const inv = await Invoice.findById(imp.invoice).select('company createdBy').lean();
        if (inv && inv.company) {
          const c2 = await Company.findById(inv.company).select('owner').lean();
          if (c2 && c2.owner) {
            companyOwner = c2.owner;
          }
        }
        // fallback: try invoice.createdBy
        if (!companyOwner && inv && inv.createdBy) {
          const u = await User.findById(inv.createdBy).select('owner company').lean();
          if (u && u.owner) companyOwner = u.owner;
        }
      }

      if (companyOwner) {
        ops.push({ filter: { _id: imp._id }, update: { $set: { ownerId: companyOwner } }, derivedFrom: 'company.owner', confidence: 'HIGH', companyId, companyOwner });
      } else {
        // include diagnostic info to explain why owner couldn't be derived
        ops.push({ filter: { _id: imp._id }, update: {}, derivedFrom: 'company', confidence: 'LOW', companyId, companyOwner });
      }
    } else {
      ops.push({ filter: { _id: imp._id }, update: {}, derivedFrom: 'none', confidence: 'UNKNOWN', companyId: null, companyOwner: null });
    }
  }

  const out = path.resolve(process.cwd(), 'migrations', 'dryrun', 'attendanceimport_backfill_ops.json');
  fs.writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), operations: ops, sampleCount: Math.min(10, ops.length) }, null, 2));
  console.log('AttendanceImport dry-run operations written to', out);
  process.exit(0);
}

run().catch((err) => { console.error(err); process.exit(1); });
