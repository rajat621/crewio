import mongoose from 'mongoose';

const workSessionSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    startAt: { type: Date, required: true },
    endAt: { type: Date, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null, index: true },
  },
  { timestamps: true }
);

// Matches the mobile lifecycle "find this employee's open session" query
// shape ({employee, endAt: null} sorted by startAt) - the existing
// single-field employee index only narrows the candidate set, leaving the
// endAt filter and sort unindexed.
workSessionSchema.index({ employee: 1, endAt: 1, startAt: -1 });

const WorkSession = mongoose.model('WorkSession', workSessionSchema);
export default WorkSession;


