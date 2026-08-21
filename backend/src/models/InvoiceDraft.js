import mongoose from 'mongoose';

/**
 * An invoice awaiting human approval.
 *
 * This is deliberately a separate collection from Invoice rather than an
 * Invoice with status 'draft'. A draft is short-lived working state that may
 * never become an invoice, and it should not consume an invoice number, show
 * up in invoice lists, or count against reporting. It expires on its own.
 *
 * The `payload` field holds the draft object exactly as the AI service
 * produced it. The Node backend never does arithmetic on it - it forwards it
 * to the AI service for recompute and stores whatever comes back. Keeping the
 * shape opaque here is what stops a third copy of the invoice maths from
 * drifting into this codebase.
 */
const invoiceDraftSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // Where the timesheet lives, so the preview window can display it beside
    // the editable table. Stored as a FileRecord reference rather than a raw
    // path - the path may be an R2 key and must go through storage.service.
    sourceFileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FileRecord',
      required: true,
    },
    sourceFileName: String,
    sourcePath: String,

    // 'approving': the atomic claim has committed (blocks any concurrent
    // second approval attempt) and a BullMQ job has been enqueued to do
    // the actual recompute/render/save work off the request thread - see
    // invoiceApproval.worker.js. Transitions to 'approved' on success or
    // back to 'ready' (with `error` set) on failure, same as the old
    // synchronous handler's own rollback-on-error behavior.
    status: {
      type: String,
      enum: ['extracting', 'ready', 'approving', 'approved', 'failed', 'discarded'],
      default: 'extracting',
      index: true,
    },

    // Opaque draft payload from the AI service.
    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    // Denormalised for list views and gating, so the UI does not have to
    // parse the whole payload to show a row.
    totals: {
      subtotal: Number,
      deductions: Number,
      vat: Number,
      netTotal: Number,
      lineCount: Number,
    },
    extractionConfidence: Number,
    extractionSource: String,
    blockingIssues: { type: [String], default: [] },

    // Render options captured when the draft is created, reused at approval
    // so the user is not asked for the template twice.
    renderOptions: {
      ownerCompanyId: mongoose.Schema.Types.ObjectId,
      templatePath: String,
      signaturePath: String,
      stampPath: String,
      includeSignature: { type: Boolean, default: true },
      includeStamp: { type: Boolean, default: true },
      includeTemplate: { type: Boolean, default: true },
      companyData: mongoose.Schema.Types.Mixed,
      // The wizard's own Invoice Date field (step 3), captured at draft
      // creation and applied to Invoice.invoiceDate at approval time -
      // without a declared field here, Mongoose silently strips any
      // undeclared key under renderOptions on save, which is exactly what
      // was happening to it before this was added.
      invoiceDate: Date,
    },

    // What the human changed, kept after approval. Over time this is the
    // cheapest signal you have for which supplier layouts the extractor is
    // still misreading - it is real corrections on real documents.
    editSummary: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    approvedAt: Date,
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' },

    error: String,

    // Mongo TTL index. Abandoned drafts clean themselves up; approved ones
    // have already produced an Invoice, so losing the draft costs nothing
    // except the edit summary, which is copied onto the audit log.
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      index: { expires: 0 },
    },
  },
  { timestamps: true }
);

invoiceDraftSchema.index({ companyId: 1, status: 1, createdAt: -1 });

const InvoiceDraft = mongoose.model('InvoiceDraft', invoiceDraftSchema);

export default InvoiceDraft;