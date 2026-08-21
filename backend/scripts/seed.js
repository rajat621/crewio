import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { connectDB } from '../src/config/db.js';
import {
  User,
  Company,
  Employee,
  Attendance,
  Invoice,
  InvoiceCounter,
  File as LegacyFile,
} from '../src/models/index.js';

const STORAGE_ROOT = path.resolve(process.cwd(), 'src', 'storage');
const UPLOADS = path.join(STORAGE_ROOT, 'uploads', 'timesheets');

const ensureDirs = () => {
  if (!fs.existsSync(UPLOADS)) fs.mkdirSync(UPLOADS, { recursive: true });
};

const seed = async () => {
  await connectDB();
  ensureDirs();

  const ownerEmail = 'owner@example.com';
  const ownerPassword = 'Password123!';

  let owner = await User.findOne({ email: ownerEmail });
  if (!owner) {
    const hash = await bcrypt.hash(ownerPassword, 10);
    owner = await User.create({ firstName: 'Owner', lastName: 'Dev', email: ownerEmail, password: hash, role: 'owner', isVerified: true });
    console.log('Created owner user', owner._id.toString());
  } else {
    console.log('Owner exists', owner._id.toString());
    // ensure password and verified
    owner.password = await bcrypt.hash(ownerPassword, 10);
    owner.isVerified = true;
    await owner.save();
  }

  // Create or reuse company
  let company = await Company.findOne({ ownerId: owner._id });
  if (!company) {
    company = await Company.create({ name: 'Seed Company', owner: owner._id, ownerId: owner._id, companyRole: 'owner', isOwner: true });
    console.log('Created company', company._id.toString());
  } else {
    console.log('Company exists', company._id.toString());
  }

  // Link user -> company
  if (!owner.company || String(owner.company) !== String(company._id)) {
    owner.company = company._id;
    await owner.save();
  }

  // Create 3 employees
  const employees = [];
  for (let i = 1; i <= 3; i++) {
    const empId = `EMP00${i}`;
    let emp = await Employee.findOne({ appUserId: empId, ownerId: owner._id });
    if (!emp) {
      const pw = `Emp${i}Pass!`;
      const hashed = await bcrypt.hash(pw, 10);
      emp = await Employee.create({
        name: `Employee ${i}`,
        firstName: `Employee${i}`,
        lastName: 'Seed',
        appUserId: empId,
        employeeId: empId,
        appPassword: hashed,
        company: company._id,
        ownerId: owner._id,
        owner: owner._id,
        status: 'active',
      });
      console.log('Created employee', empId, emp._id.toString());
    } else {
      console.log('Employee exists', empId);
    }
    employees.push(emp);
  }

  // Attendance records
  for (const emp of employees) {
    const rec = await Attendance.findOne({ employee: emp._id, ownerId: owner._id });
    if (!rec) {
      await Attendance.create({ employee: emp._id, company: company._id, ownerId: owner._id, date: new Date(), status: 'present', checkIn: '09:00' });
    }
  }
  console.log('Attendance seeded');

  // Create uploads file
  const fileName = 'seed-timesheet.pdf';
  const relPath = `/uploads/timesheets/${fileName}`;
  const absPath = path.join(UPLOADS, fileName);
  if (!fs.existsSync(absPath)) {
    fs.writeFileSync(absPath, 'PDF-DUMMY');
    console.log('Wrote seed file at', absPath);
  }

  let fileRec = await LegacyFile.findOne({ path: relPath, ownerId: owner._id });
  if (!fileRec) {
    fileRec = await LegacyFile.create({ user: owner._id, ownerId: owner._id, originalName: fileName, mimeType: 'application/pdf', size: 1024, path: relPath });
    console.log('Created FileRecord (legacy) id', fileRec._id.toString());
  }

  // Create Invoice sample
  let invoice = await Invoice.findOne({ ownerId: owner._id });
  if (!invoice) {
    invoice = await Invoice.create({ createdBy: owner._id, invoiceNumber: 'INV-0001', company: company._id, clientName: 'Client A', subtotal: 100, tax: 0, total: 100, generated_invoice_pdf: relPath, ownerId: owner._id });
    console.log('Created invoice', invoice._id.toString());
  } else {
    console.log('Invoice exists', invoice._id.toString());
  }

  // InvoiceCounter
  const scope = `invoice-user:${String(owner._id)}`;
  let counter = await InvoiceCounter.findOne({ scope, ownerId: owner._id });
  if (!counter) {
    counter = await InvoiceCounter.create({ scope, counter: 1, ownerId: owner._id });
    console.log('Created InvoiceCounter');
  }

  console.log('Seeding complete');
  process.exit(0);
};

seed().catch((err) => {
  console.error('Seed error', err);
  process.exit(1);
});
