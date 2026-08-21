import dotenv from 'dotenv';
dotenv.config();

import { connectDB } from '../src/config/db.js';
import Company from '../src/models/Company.js';
import Employee from '../src/models/Employee.js';
import SalarySlip from '../src/models/SalarySlip.js';

const run = async () => {
  await connectDB();

  // Try to find an existing employee
  let employee = await Employee.findOne().lean();

  if (!employee) {
    console.log('No employee found; creating sample company and employee');
    const company = await Company.create({ name: `SampleCo-${Date.now()}` });
    const unique = Date.now();
    const newEmp = await Employee.create({
      name: `John Doe ${unique}`,
      firstName: 'John',
      lastName: `Doe ${unique}`,
      email: `john.doe.${unique}@example.com`,
      company: company._id,
      salary: 2000,
    });
    employee = newEmp.toObject();
    console.log('Created employee', employee._id.toString(), 'company', company._id.toString());
  } else {
    console.log('Using existing employee', employee._id.toString());
  }

  // Ensure company id available
  const companyId = employee.company || null;
  if (!companyId) {
    const company = await Company.create({ name: `SampleCo-${Date.now()}` });
    await Employee.updateOne({ _id: employee._id }, { $set: { company: company._id } });
    console.log('Assigned new company to employee', company._id.toString());
    // update local object so subsequent SalarySlip create uses correct company id
    employee.company = company._id;
  }

  const slip = await SalarySlip.create({
    employee: employee._id,
    company: employee.company,
    ownerId: employee.ownerId || null,
    month: 'June',
    year: 2026,
    baseSalary: 2000,
    allowances: 200,
    deductions: 100,
    netSalary: 2100,
    status: 'generated',
  });

  console.log('Created SalarySlip:', JSON.stringify(slip, null, 2));
  process.exit(0);
};

run().catch((err) => { console.error('Error creating sample salary slip', err); process.exit(1); });
