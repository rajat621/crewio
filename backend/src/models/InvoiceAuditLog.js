import mongoose from 'mongoose';

const InvoiceAuditLogSchema = new mongoose.Schema(
  {
    invoice: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Invoice',
      required: true,
      index: true,
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },

    // Extraction audit
    extraction: {
      documentPath: String,
      extractionMethod: String,
      extractionTimestamp: Date,
      acceptedRowCount: Number,
      rejectedRowCount: Number,
      confidenceScores: mongoose.Schema.Types.Mixed,
      validationResult: mongoose.Schema.Types.Mixed,
      gatingAction: String,
      requiresManualApproval: Boolean,
    },

    // Rendering audit
    rendering: {
      templateProfileId: mongoose.Schema.Types.ObjectId,
      templateProfileVersion: Number,
      templateId: String,
      renderingTimestamp: Date,
      pageCount: Number,
      renderingDuration: Number, // ms
      successfulRegions: [String], // List of regions that rendered without issue
      warnings: [String],
    },

    // Confidence gating decision
    confidenceGating: {
      timestamp: Date,
      decision: String, // AUTO_GENERATE | REQUIRE_APPROVAL | BLOCK | WARN
      avgConfidence: Number,
      rejectionRate: Number,
      approvalRequired: Boolean,
      approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      approvalNotes: String,
    },

    // Content validation
    contentValidation: {
      totalsMismatch: Boolean,
      totalsMismatchDetails: String,
      missingRequiredFields: [String],
      overflowDetected: Boolean,
      collisionDetected: Boolean,
      validationWarnings: [String],
    },

    // User actions
    actions: [
      {
        action: String, // CREATED | APPROVED | MODIFIED | GENERATED | DOWNLOADED
        timestamp: Date,
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        details: mongoose.Schema.Types.Mixed,
      },
    ],

    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },

    // Data snapshots for legal/finance traceability
    extractionSnapshot: {
      // Full extraction JSON saved for audit
      data: mongoose.Schema.Types.Mixed,
    },
    rendererConfigSnapshot: {
      // Renderer configuration used
      data: mongoose.Schema.Types.Mixed,
    },
    templateProfileSnapshot: {
      // Template profile coordinates/zones used
      data: mongoose.Schema.Types.Mixed,
    },

    // Rejection and override tracking
    rejectionDetails: {
      rejectedRows: [mongoose.Schema.Types.Mixed],
      rejectionReasons: [String],
      manuallyRestored: [String], // Row IDs manually restored by user
    },

    // Performance metrics
    performance: {
      extractionDuration: Number, // ms
      renderingDuration: Number, // ms
      totalDuration: Number, // ms
      pdfFileSize: Number, // bytes
    },

    // Legal/compliance metadata
    compliance: {
      dataRetentionDays: Number,
      complianceLevel: String, // STANDARD | ENHANCED | STRICT
      encryptionKey: String, // Reference to encryption key if sensitive
      legalHold: Boolean,
    },

    // Notes and resolution
    notes: String,
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'GENERATED', 'ARCHIVED'],
      default: 'PENDING',
    },
  },
  { timestamps: true }
);

// Indexes for audit trail queries
InvoiceAuditLogSchema.index({ invoice: 1, createdAt: -1 });
InvoiceAuditLogSchema.index({ company: 1, createdAt: -1 });
InvoiceAuditLogSchema.index({ 'confidenceGating.decision': 1 });
InvoiceAuditLogSchema.index({ status: 1 });

export default mongoose.model('InvoiceAuditLog', InvoiceAuditLogSchema);
