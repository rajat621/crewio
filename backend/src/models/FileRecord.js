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
    // 'local' or 'r2'. Defaults to 'local' for existing records created
    // before the R2 migration - see scripts/migrate-local-to-r2.js.
    storageDriver: {
      type: String,
      enum: ['local', 'r2'],
      default: 'local',
    },
    // The R2 object key (companies/{companyId}/{folder}/{filename}) when
    // storageDriver is 'r2'. Unused for local files, which keep using `path`.
    storageKey: {
      type: String,
      default: null,
    },
    purpose: String,
    metadata: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true }
);

const FileRecord = mongoose.model('FileRecord', fileRecordSchema);
export default FileRecord;


