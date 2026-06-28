import fs from 'fs';
import path from 'path';

const reportPath = path.resolve(process.cwd(), 'scripts', 'file_record_migration_analysis_report.json');
if (!fs.existsSync(reportPath)) {
  console.error('Analysis report not found at', reportPath);
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const files = report.files || [];

const toMigrate = files.filter((f) => f.confidence === 'HIGH' || f.confidence === 'MEDIUM');

const plan = toMigrate.map((f) => {
  const fallbackOwner = (f.matches && f.matches[0] && f.matches[0].doc && (f.matches[0].doc.createdBy || f.matches[0].doc.owner)) || null;
  const fallbackCompany = f.relatedCompany || (f.matches && f.matches[0] && f.matches[0].doc && f.matches[0].doc.company) || null;
  const derivedOwner = f.derivedOwnerId || fallbackOwner || null;
  const derivedCompany = f.derivedCompanyId || fallbackCompany || f.relatedCompany || null;

  return {
    filePath: f.filePath,
    absPath: f.absPath,
    filename: f.filename,
    derivedOwnerId: derivedOwner,
    derivedCompanyId: derivedCompany,
    confidence: f.confidence,
    suggestedFileRecord: {
      ownerId: derivedOwner,
      companyId: derivedCompany,
      uploadedBy: null,
      originalName: f.filename,
      mimeType: null,
      size: null,
      path: f.filePath,
      purpose: f.detectedModule || 'unknown',
      metadata: { source: f.detectedModule, matches: f.matches ? f.matches.map(m=>m.type) : [] }
    }
  };
});

const out = path.resolve(process.cwd(), 'scripts', 'file_record_migration_plan.json');
fs.writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), totalFiles: files.length, toMigrateCount: toMigrate.length, plan }, null, 2));
console.log('FileRecord migration plan written to', out);
