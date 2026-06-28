import fs from 'fs';
import path from 'path';
import { connectDB } from '../src/config/db.js';
import mongoose from 'mongoose';

import File from '../src/models/File.js';
import FileRecord from '../src/models/FileRecord.js';
import Employee from '../src/models/Employee.js';
import Attendance from '../src/models/Attendance.js';
import Company from '../src/models/Company.js';
import { Invoice } from '../src/models/Invoice.js';
import AttendanceImport from '../src/models/AttendanceImport.js';
import ExtractionJob from '../src/models/ExtractionJob.js';
import SalarySlip from '../src/models/SalarySlip.js';
import TemplateProfile from '../src/models/TemplateProfile.js';
import AuditLog from '../src/models/AuditLog.js';

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

const sampleLimit = 5;

function filenameOf(p) {
  return path.basename(p);
}

function confidenceLabel(score) {
  if (score >= 0.8) return 'HIGH';
  if (score >= 0.5) return 'MEDIUM';
  if (score > 0) return 'LOW';
  return 'UNKNOWN';
}

async function analyzeFile(webPath, absPath) {
  const baseName = filenameOf(absPath);
  const record = {
    filePath: webPath,
    absPath,
    filename: baseName,
    detectedModule: null,
    relatedEntity: null,
    relatedCompany: null,
    relatedEmployee: null,
    derivedOwnerId: null,
    confidence: 'UNKNOWN',
    matches: [],
  };

  // Exact matches in FileRecord or File
  const fr = await FileRecord.findOne({ path: webPath }).lean();
  if (fr) {
    record.detectedModule = 'FileRecord';
    record.relatedEntity = { model: 'FileRecord', id: fr._id };
    record.relatedCompany = fr.companyId || null;
    record.relatedEmployee = null;
    record.derivedOwnerId = fr.ownerId || null;
    record.confidence = fr.ownerId ? 'HIGH' : (fr.companyId ? 'MEDIUM' : 'LOW');
    record.matches.push({ type: 'FileRecord', doc: fr });
    return record;
  }

  const f = await File.findOne({ path: webPath }).lean();
  if (f) {
    record.detectedModule = 'File';
    record.relatedEntity = { model: 'File', id: f._id };
    record.relatedCompany = f.company || null;
    record.derivedOwnerId = null;
    if (f.company) {
      const comp = await Company.findById(f.company).lean();
      if (comp && comp.owner) {
        record.derivedOwnerId = comp.owner;
        record.confidence = 'HIGH';
      } else {
        record.confidence = 'MEDIUM';
      }
    } else if (f.user) {
      record.derivedOwnerId = f.user;
      record.confidence = 'MEDIUM';
    }
    record.matches.push({ type: 'File', doc: f });
    return record;
  }

  // Invoice matches
  const inv = await Invoice.findOne({ $or: [ { source_timesheet_pdf: webPath }, { generated_invoice_pdf: webPath }, { pdfUrl: webPath } ] }).lean();
  if (inv) {
    record.detectedModule = 'Invoice';
    record.relatedEntity = { model: 'Invoice', id: inv._id };
    record.relatedCompany = inv.company || null;
    record.matches.push({ type: 'Invoice', doc: inv });
    if (inv.company) {
      const comp = await Company.findById(inv.company).lean();
      if (comp && comp.owner) {
        record.derivedOwnerId = comp.owner;
        record.confidence = 'HIGH';
      } else {
        record.confidence = 'MEDIUM';
      }
    } else if (inv.createdBy) {
      record.derivedOwnerId = inv.createdBy;
      record.confidence = 'MEDIUM';
    }
    return record;
  }

  // AttendanceImport
  const aimp = await AttendanceImport.findOne({ source_timesheet_pdf: webPath }).lean();
  if (aimp) {
    record.detectedModule = 'AttendanceImport';
    record.relatedEntity = { model: 'AttendanceImport', id: aimp._id };
    record.relatedCompany = aimp.company || null;
    if (aimp.company) {
      const comp = await Company.findById(aimp.company).lean();
      if (comp && comp.owner) {
        record.derivedOwnerId = comp.owner;
        record.confidence = 'HIGH';
      } else {
        record.confidence = 'MEDIUM';
      }
    }
    record.matches.push({ type: 'AttendanceImport', doc: aimp });
    return record;
  }

  // Employee document fields
  // Check common file fields on Employee
  const empFields = ['passportCopy','emiratesIdCopy','laborCardCopy','medicalCertificateCopy','residenceIdCopy','contractPaperCopy','avatar'];
  const empQuery = { $or: empFields.map((f) => ({ [f]: webPath })) };
  const emp = await Employee.findOne(empQuery).lean();
  if (emp) {
    record.detectedModule = 'Employee';
    record.relatedEntity = { model: 'Employee', id: emp._id };
    record.relatedEmployee = emp._id;
    record.relatedCompany = emp.company || null;
    if (emp.owner) {
      record.derivedOwnerId = emp.owner;
      record.confidence = 'HIGH';
    } else if (emp.company) {
      const comp = await Company.findById(emp.company).lean();
      if (comp && comp.owner) {
        record.derivedOwnerId = comp.owner;
        record.confidence = 'MEDIUM';
      } else {
        record.confidence = 'LOW';
      }
    }
    record.matches.push({ type: 'Employee', doc: emp });
    return record;
  }

  // Search ExtractionJob payloads for filename
  const filename = baseName;
  const ej = await ExtractionJob.findOne({ $or: [ { 'payload.source_timesheet_pdf': webPath }, { 'payload.source_pdf': webPath }, { 'payload.source_timesheet_pdf': { $regex: filename } }, { 'payload.source_pdf': { $regex: filename } } ] }).lean();
  if (ej) {
    record.detectedModule = 'ExtractionJob';
    record.relatedEntity = { model: 'ExtractionJob', id: ej._id };
    record.relatedCompany = ej.companyId || null;
    if (ej.companyId) {
      const comp = await Company.findById(ej.companyId).lean();
      if (comp && comp.owner) {
        record.derivedOwnerId = comp.owner;
        record.confidence = 'MEDIUM';
      }
    }
    record.matches.push({ type: 'ExtractionJob', doc: ej });
    return record;
  }

  // Company assets
  const comp = await Company.findOne({ $or: [ { logo: webPath }, { stamp: webPath }, { signature: webPath }, { invoiceTemplate: webPath } ] }).lean();
  if (comp) {
    record.detectedModule = 'Company';
    record.relatedEntity = { model: 'Company', id: comp._id };
    record.relatedCompany = comp._id;
    if (comp.owner) {
      record.derivedOwnerId = comp.owner;
      record.confidence = 'HIGH';
    }
    record.matches.push({ type: 'Company', doc: comp });
    return record;
  }

  // Generic searches: any field in Invoice, AttendanceImport, Employee that contains filename
  const regex = new RegExp(filename.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'));
  const inv2 = await Invoice.findOne({ $or: [ { source_timesheet_pdf: { $regex: regex } }, { generated_invoice_pdf: { $regex: regex } }, { pdfUrl: { $regex: regex } } ] }).lean();
  if (inv2) {
    record.detectedModule = 'Invoice (fuzzy)';
    record.relatedEntity = { model: 'Invoice', id: inv2._id };
    if (inv2.company) {
      const c = await Company.findById(inv2.company).lean();
      if (c && c.owner) {
        record.derivedOwnerId = c.owner;
        record.confidence = 'MEDIUM';
      }
    }
    record.matches.push({ type: 'Invoice (fuzzy)', doc: inv2 });
    return record;
  }

  // No match
  record.confidence = 'UNKNOWN';
  return record;
}

async function run() {
  await connectDB();
  const filesOnDisk = walkFiles(storageUploads);
  const webPaths = filesOnDisk.map((p) => ({ abs: p, web: toWebPath(p) }));

  const results = [];
  for (const f of webPaths) {
    const r = await analyzeFile(f.web, f.abs);
    results.push(r);
  }

  // Grouping
  const safelyMappable = results.filter((r) => r.confidence === 'HIGH' || r.confidence === 'MEDIUM');
  const needsReview = results.filter((r) => r.confidence === 'LOW');
  const orphan = results.filter((r) => r.confidence === 'UNKNOWN');

  // Attendance derivation report
  const attendanceTotal = await Attendance.countDocuments({});
  const attendanceDocs = await Attendance.find({}).select('employee company _id').lean();
  let attendanceDerivable = 0;
  let attendanceMissingEmployee = 0;
  let attendanceAmbiguous = 0;
  const attendanceSamplesAmbiguous = [];

  for (const a of attendanceDocs) {
    if (!a.employee) {
      attendanceMissingEmployee++;
      continue;
    }
    const emp = await Employee.findById(a.employee).select('owner company').lean();
    if (!emp) {
      attendanceAmbiguous++;
      if (attendanceSamplesAmbiguous.length < sampleLimit) attendanceSamplesAmbiguous.push(a._id);
      continue;
    }
    if (emp.owner) {
      attendanceDerivable++;
      continue;
    }
    if (emp.company) {
      const c = await Company.findById(emp.company).select('owner').lean();
      if (c && c.owner) {
        attendanceDerivable++;
        continue;
      } else {
        attendanceAmbiguous++;
        if (attendanceSamplesAmbiguous.length < sampleLimit) attendanceSamplesAmbiguous.push(a._id);
      }
    } else {
      attendanceAmbiguous++;
      if (attendanceSamplesAmbiguous.length < sampleLimit) attendanceSamplesAmbiguous.push(a._id);
    }
  }

  // Employee owner derivation
  const employeeTotal = await Employee.countDocuments({});
  const employeesMissingOwner = await Employee.find({ $or: [{ owner: { $exists: false } }, { owner: null }] }).select('_id company').lean();
  const employeeDerivation = { total: employeeTotal, missingOwnerCount: employeesMissingOwner.length, samples: employeesMissingOwner.slice(0, sampleLimit).map((e) => e._id) };

  // Invoice owner derivation
  const invoiceTotal = await Invoice.countDocuments({});
  const invoicesMissingOwner = await Invoice.find({ $or: [{ company: { $exists: false } }, { company: null }] }).select('_id createdBy').lean();
  const invoiceDerivation = { total: invoiceTotal, missingCompanyCount: invoicesMissingOwner.length, samples: invoicesMissingOwner.slice(0, sampleLimit).map((i) => i._id) };

  // AttendanceImport derivation
  const aimpTotal = await AttendanceImport.countDocuments({});
  const aimpMissingCompany = await AttendanceImport.find({ $or: [{ company: { $exists: false } }, { company: null }] }).select('_id').lean();
  const aimpDerivation = { total: aimpTotal, missingCompanyCount: aimpMissingCompany.length, samples: aimpMissingCompany.slice(0, sampleLimit).map((x) => x._id) };

  const report = {
    generatedAt: new Date().toISOString(),
    filesOnDiskCount: filesOnDisk.length,
    resultsCount: results.length,
    groups: {
      safelyMappable: { count: safelyMappable.length },
      needsReview: { count: needsReview.length },
      orphan: { count: orphan.length },
    },
    samples: {
      safelyMappable: safelyMappable.slice(0, sampleLimit),
      needsReview: needsReview.slice(0, sampleLimit),
      orphan: orphan.slice(0, sampleLimit),
    },
    attendance: {
      total: attendanceTotal,
      derivable: attendanceDerivable,
      missingEmployee: attendanceMissingEmployee,
      ambiguous: attendanceAmbiguous,
      ambiguousSamples: attendanceSamplesAmbiguous,
    },
    employeeDerivation,
    invoiceDerivation,
    attendanceImportDerivation: aimpDerivation,
    files: results,
  };

  const outPath = path.join(process.cwd(), 'scripts', 'file_record_migration_analysis_report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log('Report written to', outPath);
  process.exit(0);
}

run().catch((err) => {
  console.error('Analysis failed', err);
  process.exit(1);
});
