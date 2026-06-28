import { connectDB } from '../../src/config/db.js';
import mongoose from 'mongoose';

async function run() {
  await connectDB();
  const db = mongoose.connection.db;
  const collections = ['employees', 'attendances', 'invoices'];
  for (const col of collections) {
    const agg = await db.collection(col).aggregate([
      { $match: { ownerId: { $exists: true } } },
      { $group: { _id: '$ownerId', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]).toArray();
    console.log(`Top owners in ${col}:`, agg.map(a=>`${a._id}: ${a.count}`).join(', '));
  }
  process.exit(0);
}

run().catch((e)=>{ console.error(e); process.exit(1); });
