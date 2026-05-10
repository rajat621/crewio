import mongoose from 'mongoose';

const invoiceCounterSchema = new mongoose.Schema({
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    unique: true,
    required: true,
  },
  counter: {
    type: Number,
    default: 0,
  },
});

const InvoiceCounter = mongoose.model('InvoiceCounter', invoiceCounterSchema);
export default InvoiceCounter;
