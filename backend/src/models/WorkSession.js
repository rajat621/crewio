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

const WorkSession = mongoose.model('WorkSession', workSessionSchema);
export default WorkSession;


