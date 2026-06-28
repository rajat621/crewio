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
      default: null,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
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
    slipNumber: {
      type: Number,
      index: true,
    },
    deductionsDetails: {
      type: [
        {
          type: { type: String },
          amount: { type: Number },
          note: { type: String },
          createdAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    slipData: {
  type: mongoose.Schema.Types.Mixed,
  default: null,
},
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
