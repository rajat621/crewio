import { connectDB } from '../../src/config/db.js';
import Attendance from '../../src/models/Attendance.js';
import Employee from '../../src/models/Employee.js';
import Company from '../../src/models/Company.js';
import fs from 'fs';
import path from 'path';

async function run() {
  await connectDB();
  const attendances = await Attendance.find({}).lean();
  const ops = [];
  for (const a of attendances) {
    // Rule: Attendance -> Employee -> ownerId
    if (a.employee) {
      const emp = await Employee.findById(a.employee).select('owner company').lean();
      if (emp) {
        if (emp.owner) {
          ops.push({ filter: { _id: a._id }, update: { $set: { ownerId: emp.owner } }, derivedFrom: 'employee.owner', confidence: 'HIGH' });
        } else if (emp.company) {
          const c = await Company.findById(emp.company).select('owner').lean();
          if (c && c.owner) {
            ops.push({ filter: { _id: a._id }, update: { $set: { ownerId: c.owner } }, derivedFrom: 'employee.company.owner', confidence: 'MEDIUM' });
          } else {
            ops.push({ filter: { _id: a._id }, update: {}, derivedFrom: 'employee.company.owner', confidence: 'LOW' });
          }
        } else {
          ops.push({ filter: { _id: a._id }, update: {}, derivedFrom: 'employee', confidence: 'LOW' });
        }
      } else {
        ops.push({ filter: { _id: a._id }, update: {}, derivedFrom: 'employee', confidence: 'UNKNOWN' });
      }
    } else {
      ops.push({ filter: { _id: a._id }, update: {}, derivedFrom: 'none', confidence: 'UNKNOWN' });
    }
  }

  const out = path.resolve(process.cwd(), 'migrations', 'dryrun', 'attendance_backfill_ops.json');
  fs.writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), operations: ops, sampleCount: Math.min(10, ops.length) }, null, 2));
  console.log('Attendance dry-run operations written to', out);
  process.exit(0);
}

run().catch((err) => { console.error(err); process.exit(1); });
