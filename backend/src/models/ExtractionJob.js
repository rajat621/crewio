import mongoose from 'mongoose';

const extractionJobSchema = new mongoose.Schema(
  {
    jobId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    jobType: {
      type: String,
      enum: ['extract', 'extract-invoice-summary', 'extract-attendance', 'generate-invoice'],
      required: true,
    },
    status: {
      type: String,
      enum: ['queued', 'active', 'completed', 'failed'],
      default: 'queued',
      index: true,
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    requestHash: {
      type: String,
      default: null,
      index: true,
    },
    dedupeWindowMs: {
      type: Number,
      default: 0,
    },
    requestId: {
      type: String,
      default: null,
      index: true,
    },
    traceId: {
      type: String,
      default: null,
      index: true,
    },
    failureCategory: {
      type: String,
      default: null,
    },
    decisionTrace: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    result: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    error: {
      type: String,
      default: null,
    },
    attemptsMade: {
      type: Number,
      default: 0,
    },
    progress: {
      type: Number,
      default: 0,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

const ExtractionJob = mongoose.model('ExtractionJob', extractionJobSchema);

export default ExtractionJob;


