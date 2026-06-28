import { connectDB } from '../../src/config/db.js';
import mongoose from 'mongoose';

async function run() {
  await connectDB();
  const db = mongoose.connection.db;
  const checks = [
    { collection: 'employees', index: ['ownerId'] },
    { collection: 'attendances', index: ['ownerId'] },
    { collection: 'invoices', index: ['ownerId'] },
    { collection: 'filerecords', index: ['ownerId'] },
  ];
  for (const c of checks) {
    const idx = await db.collection(c.collection).indexInformation();
    const has = Object.keys(idx).some(k => c.index.every(f => idx[k].some(i=> i[0] === f)));
    console.log(`${c.collection}: ownerId index present? ${has}`);
  }
  process.exit(0);
}

run().catch((e)=>{ console.error(e); process.exit(1); });
