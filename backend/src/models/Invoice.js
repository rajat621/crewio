import mongoose from 'mongoose';

const invoiceItemSchema = new mongoose.Schema({
  description: String,
  quantity: Number,
  rate: Number,
  amount: Number,
});

const rejectedRowSchema = new mongoose.Schema(
  {
    raw_row: mongoose.Schema.Types.Mixed,
    rejection_reason: String,
    source_page: Number,
    extraction_method: String,
  },
  { _id: false }
);

const invoiceSchema = new mongoose.Schema(
  {
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    invoiceNumber: {
      type: String,
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
    source_timesheet_pdf: String,
    generated_invoice_pdf: String,
    pdfUrl: String,
    extraction_confidence_scores: {
      table_detection_score: Number,
      row_validation_score: Number,
      ocr_quality_score: Number,
      normalization_confidence: Number,
      final_confidence_score: Number,
    },
    extraction_warnings: {
      type: [String],
      default: [],
    },
    rejected_rows: {
      type: [rejectedRowSchema],
      default: [],
    },
  },
  { timestamps: true }
);

invoiceSchema.index({ createdBy: 1, invoiceNumber: 1 }, { unique: true });

const Invoice = mongoose.model('Invoice', invoiceSchema);
const InvoiceItem = mongoose.model('InvoiceItem', invoiceItemSchema);

export { Invoice, InvoiceItem };
