<<<<<<< HEAD
﻿import mongoose from 'mongoose';
=======
import mongoose from 'mongoose';
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0

const TemplateProfileSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    templateName: {
      type: String,
      required: true,
    },
    templateId: {
      type: String,
      required: true,
      default: 'branded-enterprise-v1',
    },
    version: {
      type: Number,
      default: 1,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: false,
    },
    description: {
      type: String,
      default: '',
    },

    // Safe zones for content placement
    safeZones: {
      contentLeft: { type: Number, default: 38 },
      contentRight: { type: Number, default: 557.28 },
      contentTop: { type: Number, default: 100 },
      contentBottom: { type: Number, default: 120 },
      tableTopY: { type: Number, default: 650 },
      tableBottomY: { type: Number, default: 210 },
      footerBoundaryY: { type: Number, default: 120 },
    },

    // Absolute coordinates for specific elements
    coordinates: {
      title: { x: { type: Number, default: 297.64 }, y: { type: Number, default: 720 }, size: { type: Number, default: 14 } },
      invoiceNumber: { x: { type: Number, default: 400 }, y: { type: Number, default: 680 }, size: { type: Number, default: 11 } },
      date: { x: { type: Number, default: 480 }, y: { type: Number, default: 680 }, size: { type: Number, default: 11 } },
      clientBlock: { y: { type: Number, default: 630 } },
      signature: {
        x: { type: Number, default: 48 },
        y: { type: Number, default: 55 },
        width: { type: Number, default: 150 },
        height: { type: Number, default: 90 },
      },
      dynamicTable: {
        topY: { type: Number, default: 650 },
        headerHeight: { type: Number, default: 20 },
        rowMinHeight: { type: Number, default: 18 },
      },
      totals: {
        width: { type: Number, default: 210 },
        lineGap: { type: Number, default: 18 },
        size: { type: Number, default: 10 },
      },
    },

    // Column layout configuration
    columnLayout: {
      enabledColumns: {
        type: [String],
        default: ['trade', 'id_project', 'rate', 'hours', 'amount'],
      },
      cell: {
        bodyFontMin: { type: Number, default: 7 },
        bodyFontMax: { type: Number, default: 10 },
        lineHeightFactor: { type: Number, default: 1.25 },
        rowPadding: { type: Number, default: 4 },
      },
    },

    // Footer rendering rules
    footerRules: {
      renderSignature: { type: Boolean, default: true },
      renderStamp: { type: Boolean, default: true },
      signatureLabel: { type: String, default: 'Authorized Signature' },
      includeTimestamp: { type: Boolean, default: true },
    },

    // Pagination rules
    paginationRules: {
      firstPageTableTopY: { type: Number, default: 650 },
      nextPageTableTopY: { type: Number, default: 700 },
      tableBottomY: { type: Number, default: 210 },
      minTotalsBlockHeight: { type: Number, default: 86 },
      repeatTableHeader: { type: Boolean, default: true },
    },

    // Rendering behavior
    renderRules: {
      renderTitle: { type: Boolean, default: true },
      renderMonthLabel: { type: Boolean, default: true },
      renderClientBlock: { type: Boolean, default: true },
      renderTableHeader: { type: Boolean, default: true },
      renderTableGrid: { type: Boolean, default: true },
      renderTotalsLabels: { type: Boolean, default: true },
    },

    // Template asset references
    templateAsset: {
      type: String, // file path or data URI for PDF/image template
      default: '',
    },

    // Validation and calibration metadata
    calibrationNotes: {
      type: String,
      default: '',
    },
    validationStatus: {
      type: String,
      enum: ['uncalibrated', 'calibrated', 'validated', 'deprecated'],
      default: 'uncalibrated',
    },

    // Audit trail
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
<<<<<<< HEAD
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
=======
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
    lastModifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    approvalDate: {
      type: Date,
    },
  },
  { timestamps: true }
);

// Index for company + version lookup
TemplateProfileSchema.index({ companyId: 1, version: 1 });
// Index for active templates
TemplateProfileSchema.index({ companyId: 1, isActive: 1 });

export default mongoose.model('TemplateProfile', TemplateProfileSchema);
