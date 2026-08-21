import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { Attendance, Company, Employee, SalarySlip, User } from '../src/models/index.js';

// QA large-dataset seed. Scoped entirely to a single owner account
// (rajatraj9492@gmail.com, the account used for manual UI testing) so it
// never touches or duplicates data belonging to any other tenant. Reuses
// the app's own Mongoose models (same schema/validation the real API uses)
// rather than raw inserts. Idempotent: re-running tops up to the target
// counts instead of duplicating, via deterministic natural keys
// (employeeId, company name) and upserts.

const OWNER_EMAIL = 'rajatraj9492@gmail.com';
const TARGET_COMPANIES = 100;
const TARGET_EMPLOYEES = 1000;
const SALARY_MONTHS = 3;
const MIN_EXPENSES = 5;
const MAX_EXPENSES = 8;
const ATTENDANCE_WEEKS = 8;

const CITIES = ['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Ras Al Khaimah', 'Fujairah', 'Umm Al Quwain'];
const TRADES = [
  'Mason', 'Carpenter', 'Electrician', 'Plumber', 'Painter', 'Welder', 'Helper',
  'Supervisor', 'Driver', 'Steel Fixer', 'Tile Worker', 'Foreman', 'General Worker',
  'Scaffolder', 'Surveyor', 'HVAC Technician', 'Rigger', 'Safety Officer',
];
const NATIONALITIES = ['Indian', 'Pakistani', 'Bangladeshi', 'Nepali', 'Filipino', 'Egyptian', 'Sri Lankan'];
const FIRST_NAMES = [
  'Aarav', 'Ramesh', 'Sanjay', 'Vikram', 'Kiran', 'Imran', 'Faiz', 'Rahul', 'Naveen', 'Hassan',
  'Arjun', 'Mohammad', 'Suresh', 'Bilal', 'Deepak', 'Farhan', 'Shyam', 'Usman', 'Manoj', 'Zubair',
  'Ali', 'Amit', 'Anwar', 'Ashok', 'Asif', 'Ateeq', 'Bashir', 'Dev', 'Feroz', 'Ganesh',
  'Haroon', 'Irfan', 'Jamal', 'Karim', 'Lokesh', 'Mahesh', 'Nadeem', 'Omar', 'Pradeep', 'Qasim',
];
const LAST_NAMES = [
  'Sharma', 'Thapa', 'Yadav', 'Singh', 'BK', 'Khan', 'Ali', 'Mehta', 'Kumar', 'Raza',
  'Patel', 'Saif', 'Rana', 'Ahmed', 'Roy', 'Malik', 'Lal', 'Noor', 'Gurung', 'Hussain',
  'Reddy', 'Gill', 'Chowdhury', 'Bhatt', 'Iqbal', 'Farooq', 'Rai', 'Basnet', 'Shah', 'Qureshi',
];
const COMPANY_SUFFIXES = ['Facilities Management', 'Contracting', 'Technical Services', 'Engineering', 'Projects', 'Build Services', 'Maintenance', 'Workforce Solutions'];
const COMPANY_PREFIXES = [
  'Al Noor', 'Gulf Horizon', 'Metro', 'Prime Edge', 'Desert Crest', 'Nexus', 'Blue Pearl',
  'Summit Star', 'Urban Axis', 'Vertex Pro', 'Falcon Peak', 'Silver Line', 'Golden Gate',
  'Emirates Crown', 'Oasis Point', 'Palm Ridge', 'Coral Bay', 'Amber Field', 'Crystal Vale',
  'Iron Bridge', 'Sapphire Coast', 'Pearl Harbor', 'Marina View', 'Skyline Tower', 'Horizon Edge',
];

const rand = (arr, seed) => arr[seed % arr.length];
const buildDate = (year, month, day) => new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

const seedCompanies = async (owner) => {
  const existing = await Company.find({ ownerId: owner._id, companyRole: 'client' }).lean();
  const companies = [...existing];
  const existingNames = new Set(existing.map((c) => c.name));

  let idx = 0;
  while (companies.length < TARGET_COMPANIES) {
    const prefix = rand(COMPANY_PREFIXES, idx);
    const suffix = rand(COMPANY_SUFFIXES, idx + 3);
    let name = `${prefix} ${suffix}`;
    let dupSuffix = 1;
    while (existingNames.has(name)) {
      dupSuffix += 1;
      name = `${prefix} ${suffix} ${dupSuffix}`;
    }
    existingNames.add(name);
    const city = rand(CITIES, idx);

    const company = await Company.findOneAndUpdate(
      { ownerId: owner._id, name },
      {
        name,
        companyLegalName: `${name} LLC`,
        companyRole: 'client',
        status: idx % 11 === 0 ? 'inactive' : 'active',
        city,
        countryIso: 'AE',
        nationality: 'UAE',
        countryCode: '+971',
        mobileNumber: `+971 5${(idx % 9)} ${String(4000000 + idx).slice(-7)}`,
        telephoneNumber: `+971 4 ${String(3000000 + idx).slice(-7)}`,
        contactEmail: `contact${idx}@qa-seed.example`,
        poBox: `PO Box ${20000 + idx}`,
        address: `${100 + idx} ${city} Industrial Area`,
        trn: `1002345${String(idx).padStart(5, '0')}`,
        owner: owner._id,
        ownerId: owner._id,
        createdBy: owner._id,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    companies.push(company);
    idx += 1;
  }
  return companies;
};

const seedEmployees = async (companies, owner) => {
  const existingCount = await Employee.countDocuments({ ownerId: owner._id, employeeId: /^QA-EMP/ });
  const employees = [];
  const toCreate = TARGET_EMPLOYEES - existingCount;
  console.log(`Employees already seeded: ${existingCount}. Creating ${Math.max(0, toCreate)} more...`);

  for (let index = 0; index < TARGET_EMPLOYEES; index += 1) {
    const employeeId = `QA-EMP${String(index + 1).padStart(4, '0')}`;
    const company = companies[index % companies.length];
    const firstName = rand(FIRST_NAMES, index);
    const lastName = rand(LAST_NAMES, index + 7);
    const trade = rand(TRADES, index);
    const nationality = rand(NATIONALITIES, index + 2);
    const baseSalary = 1300 + (index % 15) * 60;
    const ratePerHour = Math.round((baseSalary / 160) * 100) / 100;

    const employee = await Employee.findOneAndUpdate(
      { ownerId: owner._id, employeeId },
      {
        employeeId,
        name: `${firstName} ${lastName}`,
        firstName,
        lastName,
        gender: 'Male',
        nationality,
        trade,
        position: trade,
        department: trade,
        mobile: `+971 55 ${String(300000 + index).slice(-6)}`,
        mobileNumber: `+971 55 ${String(300000 + index).slice(-6)}`,
        phoneCountryIso: 'AE',
        countryCode: '+971',
        state: 'Dubai',
        city: company.city,
        address: `${60 + index} ${company.city} Labour Camp`,
        salary: baseSalary,
        ratePerHour,
        overtimeRate: Math.round(ratePerHour * 1.5 * 100) / 100,
        employmentType: index % 10 === 0 ? 'part-time' : 'full-time',
        joiningDate: buildDate(2022 + (index % 4), (index % 12) + 1, ((index * 3) % 27) + 1),
        joinDate: buildDate(2022 + (index % 4), (index % 12) + 1, ((index * 3) % 27) + 1),
        passportNo: `P${String(100000 + index).slice(-7)}`,
        passportExpiry: buildDate(2026 + (index % 4), ((index % 12) + 1), 15),
        passportStatus: index % 13 === 0 ? 'expired' : index % 7 === 0 ? 'expiring-soon' : 'valid',
        emiratesId: `784-${String(1985 + (index % 15)).slice(-4)}-${String(400000 + index).slice(-7)}-${index % 10}`,
        emiratesIdExpiry: buildDate(2026 + (index % 4), ((index % 12) + 1), 20),
        emirateIdStatus: index % 17 === 0 ? 'expired' : index % 9 === 0 ? 'expiring-soon' : 'valid',
        status: index % 23 === 0 ? 'inactive' : 'active',
        assignedStatus: index % 5 === 0 ? 'on-hold' : index % 5 === 1 ? 'site-over' : 'on-site',
        company: company._id,
        owner: owner._id,
        ownerId: owner._id,
        appUserId: `qa-emp-${String(index + 1).padStart(4, '0')}`,
        appPassword: `qa-emp-${String(index + 1).padStart(4, '0')}@123`,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    employees.push(employee);

    if ((index + 1) % 100 === 0) console.log(`  employees upserted: ${index + 1}/${TARGET_EMPLOYEES}`);
  }
  return employees;
};

const seedSalarySlips = async (employees, owner) => {
  const months = [];
  const now = new Date();
  for (let i = 0; i < SALARY_MONTHS; i += 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push({ year: d.getUTCFullYear(), month: String(d.getUTCMonth() + 1).padStart(2, '0') });
  }

  let count = 0;
  const ops = [];
  employees.forEach((employee, index) => {
    months.forEach((m, mi) => {
      const baseSalary = employee.salary || 1500;
      const allowances = Math.round(baseSalary * 0.1 + (index % 5) * 10);
      const deductions = Math.round(baseSalary * 0.03 + (mi % 3) * 5);
      const netSalary = Math.round((baseSalary + allowances - deductions) * 100) / 100;

      ops.push({
        updateOne: {
          filter: { employee: employee._id, month: m.month, year: m.year, ownerId: owner._id },
          update: {
            $setOnInsert: {
              employee: employee._id,
              company: employee.company,
              ownerId: owner._id,
              month: m.month,
              year: m.year,
              baseSalary,
              allowances,
              deductions,
              netSalary,
              slipNumber: index * 10 + mi,
              status: mi === 0 ? 'generated' : 'sent',
            },
          },
          upsert: true,
        },
      });
      count += 1;
    });
  });

  for (let i = 0; i < ops.length; i += 1000) {
    await SalarySlip.bulkWrite(ops.slice(i, i + 1000), { ordered: false });
  }
  return count;
};

const EXPENSE_TYPES = ['advance', 'gas', 'food', 'travel', 'fine', 'gas deduction', 'food deduction', 'travel deduction', 'other'];

const seedExpenses = async (employees) => {
  let count = 0;
  const ops = [];
  employees.forEach((employee, index) => {
    const existingRecords = employee.expenses?.records || [];
    if (existingRecords.length >= MIN_EXPENSES) return; // already has data, skip (idempotent)

    const numExpenses = MIN_EXPENSES + (index % (MAX_EXPENSES - MIN_EXPENSES + 1));
    const records = [];
    let advanceGiven = 0;
    for (let i = 0; i < numExpenses; i += 1) {
      const isAdvance = i === 0; // first record is always an advance so deductions have a balance to draw from
      const type = isAdvance ? 'advance' : rand(EXPENSE_TYPES.slice(1), index + i);
      const isDeduction = type.includes('deduction') || type === 'fine';
      let amount = isAdvance ? 500 + (index % 6) * 50 : 20 + ((index + i) % 12) * 15;
      if (isAdvance) advanceGiven = amount;
      if (isDeduction) amount = Math.min(amount, Math.max(10, advanceGiven * 0.1));

      records.push({
        _id: `qa-${employee._id}-${i}-${Date.now()}${i}`,
        type,
        amount: Math.round(amount * 100) / 100,
        date: buildDate(2026, ((index + i) % 6) + 1, ((index * 2 + i) % 27) + 1).toISOString(),
        note: `QA seed ${type} expense`,
      });
    }

    ops.push({
      updateOne: {
        filter: { _id: employee._id },
        update: { $set: { 'expenses.records': records } },
      },
    });
    count += numExpenses;
  });

  for (let i = 0; i < ops.length; i += 500) {
    await Employee.bulkWrite(ops.slice(i, i + 500), { ordered: false });
  }
  return count;
};

const seedAttendance = async (employees, owner) => {
  const statuses = ['present', 'present', 'present', 'present', 'absent', 'leave'];
  const today = new Date();
  const ops = [];
  let count = 0;

  employees.forEach((employee, empIndex) => {
    for (let week = 0; week < ATTENDANCE_WEEKS; week += 1) {
      for (let day = 0; day < 5; day += 1) {
        const daysAgo = week * 7 + day;
        const d = new Date(today);
        d.setUTCDate(d.getUTCDate() - daysAgo);
        const date = buildDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
        const status = rand(statuses, empIndex + week + day);
        const checkIn = status === 'present' ? `0${7 + (empIndex % 2)}:${String((empIndex * 3) % 60).padStart(2, '0')} AM` : '';
        const checkOut = status === 'present' ? `0${4 + (empIndex % 2)}:${String((empIndex * 5) % 60).padStart(2, '0')} PM` : '';

        ops.push({
          updateOne: {
            filter: { employee: employee._id, date },
            update: {
              $setOnInsert: {
                employee: employee._id,
                company: employee.company,
                ownerId: owner._id,
                userId: employee.appUserId,
                date,
                checkIn,
                checkOut,
                hoursWorked: status === 'present' ? 8 : 0,
                status,
                remarks: status === 'present' ? 'Regular shift' : status === 'leave' ? 'Approved leave' : 'Absent',
              },
            },
            upsert: true,
          },
        });
        count += 1;
      }
    }
  });

  for (let i = 0; i < ops.length; i += 2000) {
    await Attendance.bulkWrite(ops.slice(i, i + 2000), { ordered: false });
    console.log(`  attendance upserted: ${Math.min(i + 2000, ops.length)}/${ops.length}`);
  }
  return count;
};

const main = async () => {
  if (!env.MONGODB_URI) throw new Error('MONGODB_URI is not defined');
  await mongoose.connect(env.MONGODB_URI);

  const owner = await User.findOne({ email: OWNER_EMAIL });
  if (!owner) throw new Error(`Owner ${OWNER_EMAIL} not found - log in through the UI first.`);
  console.log('Owner:', owner._id.toString());

  console.log('\n--- Seeding companies ---');
  const companies = await seedCompanies(owner);
  console.log(`Companies: ${companies.length}`);

  console.log('\n--- Seeding employees ---');
  const employees = await seedEmployees(companies, owner);
  console.log(`Employees: ${employees.length}`);

  console.log('\n--- Seeding salary slips ---');
  const salaryCount = await seedSalarySlips(employees, owner);
  console.log(`Salary slips upserted (attempted): ${salaryCount}`);

  console.log('\n--- Seeding expenses ---');
  const expenseCount = await seedExpenses(employees);
  console.log(`Expense records written: ${expenseCount}`);

  console.log('\n--- Seeding attendance ---');
  const attendanceCount = await seedAttendance(employees, owner);
  console.log(`Attendance records upserted (attempted): ${attendanceCount}`);

  console.log('\nDone.');
  await mongoose.disconnect();
};

main().catch(async (error) => {
  console.error('QA large dataset seed failed:', error);
  try { await mongoose.disconnect(); } catch (_e) { /* ignore */ }
  process.exit(1);
});
