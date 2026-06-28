<<<<<<< HEAD
﻿import dotenv from 'dotenv';
=======
import dotenv from 'dotenv';
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
import mongoose from 'mongoose';
import { Invoice } from '../src/models/Invoice.js';
import InvoiceCounter from '../src/models/InvoiceCounter.js';

dotenv.config();

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  const collection = Invoice.collection;
  const indexes = await collection.indexes();
  const hasGlobalInvoiceIndex = indexes.some((idx) => idx.name === 'invoiceNumber_1' && idx.unique);

  if (hasGlobalInvoiceIndex) {
    await collection.dropIndex('invoiceNumber_1');
    console.log('Dropped unique index: invoiceNumber_1');
  } else {
    console.log('No global unique index invoiceNumber_1 found');
  }

  await collection.createIndex({ createdBy: 1, invoiceNumber: 1 }, { unique: true, name: 'createdBy_1_invoiceNumber_1' });
  console.log('Ensured unique index: createdBy_1_invoiceNumber_1');

  const counterCollection = InvoiceCounter.collection;
  const counterIndexes = await counterCollection.indexes();

  for (const index of counterIndexes) {
    if (index.name === '_id_' || index.name === 'scope_1') {
      continue;
    }

    await counterCollection.dropIndex(index.name);
    console.log(`Dropped stale counter index: ${index.name}`);
  }

  await counterCollection.createIndex({ scope: 1 }, { unique: true, name: 'scope_1' });
  console.log('Ensured unique index: scope_1');

  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error('Invoice index migration failed:', error.message);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore cleanup errors
  }
  process.exit(1);
});
