import mongoose from 'mongoose';

// Company-level expenses (rent, utilities, groceries, travel, etc.) - these
// are NOT tied to any employee, unlike Employee.expenses (the per-employee
// advance ledger behind the "Labor Expense" tab). Kept as its own top-level
// collection rather than another Mixed bag on some parent document, since
// this is genuinely tabular data (one row per expense) that benefits from
// real querying/sorting/pagination at the DB level.
const companyExpenseSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    date: {
      type: Date,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true }
);

companyExpenseSchema.index({ ownerId: 1, date: -1 });

const CompanyExpense = mongoose.model('CompanyExpense', companyExpenseSchema);

export default CompanyExpense;