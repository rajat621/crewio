// One-time backfill for Employee.totalInvestmentAmount and
// Employee.totalEarnedAmount - both are new cached/running fields (see
// models/Employee.js) maintained incrementally going forward
// (employee.controller.js's updateEmployee, salarySlip.controller.js's
// create/update/addDeduction), but existing employees have neither field
// set yet. Without this, Finance's Money Made table and the Employee
// Profile page's own "Total Investment"/"Total Earned" KPI cards would
// show 0 for every employee until their next unrelated write, even though
// real historical data already exists in `expenses` and SalarySlip.
//
// Run with `node src/scripts/backfill-employee-financial-totals.js` for a
// dry-run preview, add --apply to persist.
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { sumEmployeeExpenseCategories } from '../utils/employeeExpenseFields.js';

dotenv.config();

const uri = process.env.MONGODB_URI;
const shouldApply = process.argv.includes('--apply');
const PAID_SLIP_STATUSES = ['generated', 'sent'];

const main = async () => {
  if (!uri) {
    throw new Error('MONGODB_URI is not defined in .env file');
  }

  await mongoose.connect(uri);

  const employeesCollection = mongoose.connection.db.collection('employees');
  const salarySlipsCollection = mongoose.connection.db.collection('salaryslips');

  const [employees, earnedByEmployee] = await Promise.all([
    employeesCollection.find({}, { projection: { _id: 1, expenses: 1 } }).toArray(),
    salarySlipsCollection
      .aggregate([
        { $match: { status: { $in: PAID_SLIP_STATUSES } } },
        { $group: { _id: '$employee', totalPaid: { $sum: '$netSalary' } } },
      ])
      .toArray(),
  ]);

  const earnedMap = new Map(earnedByEmployee.map((r) => [String(r._id), r.totalPaid || 0]));

  let willChangeCount = 0;
  const updates = [];

  for (const employee of employees) {
    const totalInvestmentAmount = sumEmployeeExpenseCategories(employee.expenses || {});
    const totalEarnedAmount = earnedMap.get(String(employee._id)) || 0;

    updates.push({
      updateOne: {
        filter: { _id: employee._id },
        update: { $set: { totalInvestmentAmount, totalEarnedAmount } },
      },
    });
    willChangeCount += 1;
  }

  console.log('Employee financial totals backfill preview:');
  console.log(`- Total employees: ${employees.length}`);
  console.log(`- Records to set: ${willChangeCount}`);

  if (!shouldApply) {
    console.log('Dry run only. Re-run with --apply to persist updates.');
    await mongoose.disconnect();
    return;
  }

  if (updates.length > 0) {
    await employeesCollection.bulkWrite(updates, { ordered: false });
  }

  console.log(`Applied updates: ${updates.length}`);
  await mongoose.disconnect();
};

main().catch(async (error) => {
  console.error('Backfill failed:', error.message);
  try {
    await mongoose.disconnect();
  } catch (_e) {
    // no-op
  }
  process.exit(1);
});
