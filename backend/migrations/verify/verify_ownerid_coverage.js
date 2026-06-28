import { connectDB } from '../../src/config/db.js';
import Employee from '../../src/models/Employee.js';
import Attendance from '../../src/models/Attendance.js';
import { Invoice } from '../../src/models/Invoice.js';

async function reportCoverage(Model, name) {
  const total = await Model.countDocuments();
  const withOwner = await Model.countDocuments({ ownerId: { $exists: true, $ne: null } });
  console.log(`${name}: ${withOwner}/${total} (${((withOwner/total)*100 || 0).toFixed(2)}%) have ownerId`);
}

async function run() {
  await connectDB();
  await reportCoverage(Employee, 'Employee');
  await reportCoverage(Attendance, 'Attendance');
  await reportCoverage(Invoice, 'Invoice');
  process.exit(0);
}

run().catch((e)=>{ console.error(e); process.exit(1); });
