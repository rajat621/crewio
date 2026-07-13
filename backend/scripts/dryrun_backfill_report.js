import fs from 'fs';
import path from 'path';
import { connectDB } from '../src/config/db.js';
import mongoose from 'mongoose';

// Models
import FileRecord from '../src/models/FileRecord.js';
import Employee from '../src/models/Employee.js';
import Attendance from '../src/models/Attendance.js';
import SalarySlip from '../src/models/SalarySlip.js';
import { Invoice } from '../src/models/Invoice.js';
import AttendanceImport from '../src/models/AttendanceImport.js';
import ExtractionJob from '../src/models/ExtractionJob.js';
import TemplateProfile from '../src/models/TemplateProfile.js';
import AuditLog from '../src/models/AuditLog.js';
import InvoiceAuditLog from '../src/models/InvoiceAuditLog.js';

const storageUploads = path.resolve(process.cwd(), 'src', 'storage', 'uploads');

const walkFiles = (dir) => {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat && stat.isDirectory()) {
      results.push(...walkFiles(full));
    } else {
      results.push(full);
    }
  });
  return results;
};

const toWebPath = (abs) => {
  const rel = path.relative(path.resolve(process.cwd(), 'src', 'storage'), abs).replace(/\\/g, '/');
  return '/' + rel;
};

const sampleLimit = 10;

async function run() {
  await connectDB();

  const filesOnDisk = walkFiles(storageUploads);
  const fileRecords = await FileRecord.find({}).lean();
  const recordedPaths = new Set(fileRecords.map((f) => f.path));

  const unmatched = filesOnDisk
    .map((abs) => toWebPath(abs))
    .filter((p) => !recordedPaths.has(p));

  const collectionsToCheck = [
    { name: 'Employee', model: Employee },
    { name: 'Attendance', model: Attendance },
    { name: 'SalarySlip', model: SalarySlip },
    { name: 'Invoice', model: Invoice },
    { name: 'AttendanceImport', model: AttendanceImport },
    { name: 'ExtractionJob', model: ExtractionJob },
    { name: 'TemplateProfile', model: TemplateProfile },
    { name: 'AuditLog', model: AuditLog },
    { name: 'InvoiceAuditLog', model: InvoiceAuditLog },
  ];

  const report = {
    generatedAt: new Date().toISOString(),
    filesOnDiskCount: filesOnDisk.length,
    fileRecordsCount: fileRecords.length,
    filesWithoutFileRecord: {
      count: unmatched.length,
      samples: unmatched.slice(0, sampleLimit),
    },
    collections: {},
  };

  for (const coll of collectionsToCheck) {
    try {
      const missingOwnerCount = await coll.model.countDocuments({ $or: [{ ownerId: { $exists: false } }, { ownerId: null }] });
      const samples = await coll.model.find({ $or: [{ ownerId: { $exists: false } }, { ownerId: null }] }).limit(sampleLimit).lean();
      report.collections[coll.name] = {
        missingOwnerCount,
        sampleIds: samples.map((s) => s._id),
      };
    } catch (err) {
      report.collections[coll.name] = { error: String(err.message) };
    }
  }

  const outPath = path.join(process.cwd(), 'scripts', 'dryrun_report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log('Dry-run report written to', outPath);
  process.exit(0);
}

run().catch((err) => {
  console.error('Dry-run failed', err);
  process.exit(1);
});
