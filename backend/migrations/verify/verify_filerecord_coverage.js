import { connectDB } from '../../src/config/db.js';
import FileRecord from '../../src/models/FileRecord.js';
import fs from 'fs';
import path from 'path';

const PLAN_PATH = path.resolve(process.cwd(), 'scripts', 'file_record_migration_plan.json');

async function run() {
  await connectDB();
  if (!fs.existsSync(PLAN_PATH)) {
    console.error('Plan missing:', PLAN_PATH);
    process.exit(1);
  }
  const plan = JSON.parse(fs.readFileSync(PLAN_PATH, 'utf8'));
  const items = plan.plan || [];
  const totalPlan = items.length;
  let covered = 0;
  for (const it of items) {
    const e = await FileRecord.findOne({ path: it.filePath }).lean();
    if (e) covered++;
  }
  console.log(`FileRecord coverage: ${covered}/${totalPlan} (${((covered/totalPlan)*100 || 0).toFixed(2)}%)`);
  process.exit(0);
}

run().catch((e)=>{ console.error(e); process.exit(1); });
