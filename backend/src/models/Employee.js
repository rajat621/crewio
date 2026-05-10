import mongoose from 'mongoose';

const employeeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      unique: true,
      sparse: true,
    },
    mobileNumber: {
      type: String,
    },
    position: {
      type: String,
    },
    department: {
      type: String,
    },
    salary: {
      type: Number,
    },
    joinDate: {
      type: Date,
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'resigned'],
      default: 'active',
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
    },
  },
  { timestamps: true }
);

const Employee = mongoose.model('Employee', employeeSchema);
export default Employee;
