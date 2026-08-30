// One-time backfill for the QA-seeded employees' "Total Investment" data.
//
// seed-qa-large-dataset.js's seedExpenses() only ever wrote
// expenses.records[] (the advance/deduction ledger), never the separate
// Employee Expenses tab category fields (offerLetter, insurance, etc. -
// see employeeExpenseFields.js) that Employee.totalInvestmentAmount and
// Finance's Money Made table actually sum. Real production employees get
// these from the Employee Expenses tab UI; QA-seeded employees never had
// anyone fill that tab in, so their Total Investment/ROI sit at a
// genuinely-accurate 0 - correct given the data, but not useful for a
// load-test dataset meant to look like a working tenant.
//
// Scoped to QA-seeded employees only (employeeId matching /^QA-EMP/) -
// this does not touch any real employee's data.
//
// Run with `node src/scripts/backfill-qa-employee-investment-categories.js`
// for a dry-run preview, add --apply to persist.
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

const uri = process.env.MONGODB_URI;
const shouldApply = process.argv.includes('--apply');

const seedInvestmentCategories = (index) => ({
  offerLetter: 150 + (index % 4) * 25,
  entryPermit: 300 + (index % 5) * 40,
  recruitment: 400 + (index % 6) * 50,
  emiratesId: 120 + (index % 3) * 20,
  stampingFee: 220 + (index % 4) * 30,
  insurance: 350 + (index % 5) * 45,
  medicalInsurance: 280 + (index % 4) * 35,
  laborPRE: 90 + (index % 3) * 15,
});

const main = async () => {
  if (!uri) {
    throw new Error('MONGODB_URI is not defined in .env file');
  }

  await mongoose.connect(uri);

  const employeesCollection = mongoose.connection.db.collection('employees');

  const employees = await employeesCollection
    .find(
      { employeeId: { $regex: /^QA-EMP/ }, totalInvestmentAmount: { $in: [0, null] } },
      { projection: { _id: 1, employeeId: 1 } }
    )
    .toArray();

  const updates = employees.map((employee, index) => {
    const investmentCategories = seedInvestmentCategories(index);
    const totalInvestmentAmount = Object.values(investmentCategories).reduce((sum, v) => sum + v, 0);
    return {
      updateOne: {
        filter: { _id: employee._id },
        update: {
          $set: {
            ...Object.fromEntries(
              Object.entries(investmentCategories).map(([key, value]) => [`expenses.${key}`, value])
            ),
            totalInvestmentAmount,
          },
        },
      },
    };
  });

  console.log('QA employee investment-categories backfill preview:');
  console.log(`- Matching QA employees with 0 investment: ${employees.length}`);
  console.log(`- Records to set: ${updates.length}`);

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
