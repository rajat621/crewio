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

// One salary slip per employee per payroll month, per company - this is the
// actual DB-level guarantee (the controller-level check in
// createSalarySlip is the friendly, race-condition-safe first line of
// defense; this index is what makes it impossible even if two requests
// land at the same instant). Existing databases created before this index
// existed may already contain duplicates for the same employee/month/year -
// those must be de-duplicated (e.g. keep the newest, delete the rest)
// before this migration/index can be applied, or index creation will fail.
salarySlipSchema.index(
  { employee: 1, month: 1, year: 1, ownerId: 1 },
  { unique: true, name: 'unique_employee_month_year_owner' }
);

export default SalarySlip;


