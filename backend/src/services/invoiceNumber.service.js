import InvoiceCounter from '../models/InvoiceCounter.js';
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
    { $max: { counter: highestPersisted } },
    { upsert: true, setDefaultsOnInsert: true }
  );

  return highestPersisted;
};

export const getNextInvoiceNumber = async (userId) => {
  if (!userId) {
    throw new Error('userId is required for invoice numbering');
  }

  const counterScope = getCounterScope(userId);
  await syncCounterWithInvoices(userId);

  const counterDoc = await InvoiceCounter.findOne({ scope: counterScope }).lean();
  const nextValue = (counterDoc?.counter || 0) + 1;
  return toInvoiceNumber(nextValue);
};

export const generateInvoiceNumber = async (userId) => {
  if (!userId) {
    throw new Error('userId is required for invoice numbering');
  }

  const counterScope = getCounterScope(userId);
  await syncCounterWithInvoices(userId);

  const updated = await InvoiceCounter.findOneAndUpdate(
    { scope: counterScope },
    { $inc: { counter: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return toInvoiceNumber(updated.counter);
};

export default { generateInvoiceNumber, getNextInvoiceNumber };
