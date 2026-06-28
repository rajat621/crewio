<<<<<<< HEAD
﻿import InvoiceCounter from '../models/InvoiceCounter.js';
=======
import InvoiceCounter from '../models/InvoiceCounter.js';
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
import { Invoice } from '../models/Invoice.js';

const padNumber = (num) => String(num).padStart(6, '0');
const INVOICE_PREFIX = 'INV-';

const toInvoiceNumber = (counterValue) => `INV-${padNumber(counterValue)}`;

const parseInvoiceSerial = (invoiceNumber) => {
  if (typeof invoiceNumber !== 'string') return 0;
  if (!invoiceNumber.startsWith(INVOICE_PREFIX)) return 0;

  const serialPart = invoiceNumber.slice(INVOICE_PREFIX.length);
  const parsed = Number.parseInt(serialPart, 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getCounterScope = (userId) => `invoice-user:${String(userId || '')}`;

<<<<<<< HEAD
const getHighestPersistedInvoiceSerial = async (userId, ownerId) => {
  if (!userId) return 0;

  const query = { createdBy: userId, invoiceNumber: { $regex: `^${INVOICE_PREFIX}\d+$` } };
  if (ownerId) query.ownerId = ownerId;

  const latestInvoice = await Invoice.findOne(query, { invoiceNumber: 1 }).sort({ invoiceNumber: -1 }).lean();
  return parseInvoiceSerial(latestInvoice?.invoiceNumber);
};

const syncCounterWithInvoices = async (userId, ownerId) => {
  if (!userId) return 0;

  const counterScope = getCounterScope(userId);
  const highestPersisted = await getHighestPersistedInvoiceSerial(userId, ownerId);
  if (!highestPersisted) return 0;

  await InvoiceCounter.findOneAndUpdate(
    { scope: counterScope, ownerId: ownerId || null },
=======
const getHighestPersistedInvoiceSerial = async (userId) => {
  if (!userId) return 0;

  const latestInvoice = await Invoice.findOne(
    { createdBy: userId, invoiceNumber: { $regex: `^${INVOICE_PREFIX}\\d+$` } },
    { invoiceNumber: 1 }
  )
    .sort({ invoiceNumber: -1 })
    .lean();

  return parseInvoiceSerial(latestInvoice?.invoiceNumber);
};

const syncCounterWithInvoices = async (userId) => {
  if (!userId) return 0;

  const counterScope = getCounterScope(userId);
  const highestPersisted = await getHighestPersistedInvoiceSerial(userId);
  if (!highestPersisted) return 0;

  await InvoiceCounter.findOneAndUpdate(
    { scope: counterScope },
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
    { $max: { counter: highestPersisted } },
    { upsert: true, setDefaultsOnInsert: true }
  );

  return highestPersisted;
};

<<<<<<< HEAD
export const getNextInvoiceNumber = async (userId, ownerId) => {
=======
export const getNextInvoiceNumber = async (userId) => {
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
  if (!userId) {
    throw new Error('userId is required for invoice numbering');
  }

  const counterScope = getCounterScope(userId);
<<<<<<< HEAD
  await syncCounterWithInvoices(userId, ownerId);

  const counterDoc = await InvoiceCounter.findOne({ scope: counterScope, ownerId: ownerId || null }).lean();
=======
  await syncCounterWithInvoices(userId);

  const counterDoc = await InvoiceCounter.findOne({ scope: counterScope }).lean();
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
  const nextValue = (counterDoc?.counter || 0) + 1;
  return toInvoiceNumber(nextValue);
};

<<<<<<< HEAD
export const generateInvoiceNumber = async (userId, ownerId) => {
=======
export const generateInvoiceNumber = async (userId) => {
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
  if (!userId) {
    throw new Error('userId is required for invoice numbering');
  }

  const counterScope = getCounterScope(userId);
<<<<<<< HEAD
  await syncCounterWithInvoices(userId, ownerId);

  const updated = await InvoiceCounter.findOneAndUpdate(
    { scope: counterScope, ownerId: ownerId || null },
=======
  await syncCounterWithInvoices(userId);

  const updated = await InvoiceCounter.findOneAndUpdate(
    { scope: counterScope },
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
    { $inc: { counter: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return toInvoiceNumber(updated.counter);
};

export default { generateInvoiceNumber, getNextInvoiceNumber };
