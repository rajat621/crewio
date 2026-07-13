import mongoose from 'mongoose';

const fileRecordSchema = new mongoose.Schema(
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
      default: null,
      index: true,
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    originalName: String,
    mimeType: String,
    size: Number,
    path: {
      type: String,
      required: true,
      index: true,
    },
    purpose: String,
    metadata: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true }
);

const FileRecord = mongoose.model('FileRecord', fileRecordSchema);
export default FileRecord;


