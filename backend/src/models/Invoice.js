import mongoose from 'mongoose';

const invoiceItemSchema = new mongoose.Schema({
  description: String,
  quantity: Number,
  rate: Number,
  amount: Number,
});

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      unique: true,
      required: true,
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
    },
    invoiceDate: {
      type: Date,
      default: Date.now,
    },
    dueDate: {
      type: Date,
    },
    clientName: {
      type: String,
      required: true,
    },
    clientEmail: {
      type: String,
    },
    items: [invoiceItemSchema],
    subtotal: Number,
    tax: Number,
    total: Number,
    status: {
      type: String,
      enum: ['draft', 'sent', 'paid', 'overdue'],
      default: 'draft',
    },
    notes: String,
    pdfUrl: String,
  },
  { timestamps: true }
);

const Invoice = mongoose.model('Invoice', invoiceSchema);
const InvoiceItem = mongoose.model('InvoiceItem', invoiceItemSchema);

export { Invoice, InvoiceItem };
