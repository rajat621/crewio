import mongoose from 'mongoose';

const salarySlipSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
    },
    month: {
      type: String,
      required: true,
    },
    year: {
      type: Number,
      required: true,
    },
    baseSalary: Number,
    allowances: Number,
    deductions: Number,
    netSalary: Number,
    status: {
      type: String,
      enum: ['draft', 'generated', 'sent'],
      default: 'draft',
    },
  },
  { timestamps: true }
);

const SalarySlip = mongoose.model('SalarySlip', salarySlipSchema);
export default SalarySlip;
