<<<<<<< HEAD
﻿import mongoose from 'mongoose';
=======
import mongoose from 'mongoose';
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0

const attendanceImportSchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
<<<<<<< HEAD
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
=======
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
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
