import mongoose from 'mongoose';

const employeeDocumentSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    fileRecord: { type: mongoose.Schema.Types.ObjectId, ref: 'FileRecord', required: true, index: true },
    type: { type: String, default: 'generic' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  },
  { timestamps: true }
);

const EmployeeDocument = mongoose.model('EmployeeDocument', employeeDocumentSchema);
export default EmployeeDocument;
