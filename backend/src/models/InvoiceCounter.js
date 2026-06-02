import mongoose from 'mongoose';

const invoiceCounterSchema = new mongoose.Schema({
  scope: {
    type: String,
    unique: true,
    required: true,
    default: 'invoice-global',
  },
  counter: {
    type: Number,
    default: 0,
  },
});

const InvoiceCounter = mongoose.model('InvoiceCounter', invoiceCounterSchema);
export default InvoiceCounter;
