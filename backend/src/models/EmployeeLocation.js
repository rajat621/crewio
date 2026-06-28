import mongoose from 'mongoose';

const employeeLocationSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    accuracy: { type: Number, default: 0 },
    timestamp: { type: Date, default: Date.now },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null, index: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

const EmployeeLocation = mongoose.model('EmployeeLocation', employeeLocationSchema);
export default EmployeeLocation;
