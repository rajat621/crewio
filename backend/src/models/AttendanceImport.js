import mongoose from 'mongoose';

const attendanceImportSchema = new mongoose.Schema(
  {
    company: {
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
    invoice: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Invoice',
      default: null,
      index: true,
    },
    source_timesheet_pdf: {
      type: String,
      required: true,
    },
    extraction_method: {
      type: String,
      default: 'unknown',
    },
    confidence_scores: {
      table_detection_score: Number,
      row_validation_score: Number,
      ocr_quality_score: Number,
      normalization_confidence: Number,
      final_confidence_score: Number,
    },
    attendance_rows: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    extraction_warnings: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true }
);

const AttendanceImport = mongoose.model('AttendanceImport', attendanceImportSchema);

export default AttendanceImport;


