import dotenv from 'dotenv';
import mongoose from 'mongoose';
import User from '../src/models/User.js';

dotenv.config();

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  const collection = User.collection;
  const indexes = await collection.indexes();
  const staleEmployeeIdIndex = indexes.find((idx) => idx.name === 'employeeId_1' && idx.unique);

  if (staleEmployeeIdIndex) {
    await collection.dropIndex('employeeId_1');
    console.log('Dropped stale unique index: employeeId_1');
  } else {
    console.log('No stale employeeId_1 unique index found');
  }

  const currentIndexes = await collection.indexes();
  const indexNames = currentIndexes.map((idx) => idx.name).join(', ');
  console.log(`Current user indexes: ${indexNames}`);

  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error('User index migration failed:', error.message);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore cleanup errors
  }
  process.exit(1);
});
