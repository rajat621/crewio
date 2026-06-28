import mongoose from 'mongoose';

const migrationLogSchema = new mongoose.Schema(
  {
    migrationName: { type: String, required: true, index: true },
    collection: { type: String, required: true, index: true },
    documentId: { type: mongoose.Schema.Types.ObjectId, required: false, index: true },
    before: { type: mongoose.Schema.Types.Mixed },
    after: { type: mongoose.Schema.Types.Mixed },
    executedAt: { type: Date, default: Date.now, index: true },
    executedBy: { type: String, default: 'migration-tool' },
  },
  { timestamps: false }
);

const MigrationLog = mongoose.model('MigrationLog', migrationLogSchema);
export default MigrationLog;
