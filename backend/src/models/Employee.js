import mongoose from 'mongoose';

const employeeSchema = new mongoose.Schema(
  {
    employeeId: {
      type: String,
    },
    firstName: {
      type: String,
    },
    lastName: {
      type: String,
    },
    name: {
      type: String,
      required: true,
    },
    gender: {
      type: String,
    },
    dateOfBirth: {
      type: Date,
    },
    email: {
      type: String,
      unique: true,
      sparse: true,
    },
    mobile: {
      type: String,
    },
    mobileNumber: {
      type: String,
    },
    phoneCountryIso: {
      type: String,
    },
    countryCode: {
      type: String,
    },
    nationality: {
      type: String,
    },
    state: {
      type: String,
    },
    city: {
      type: String,
    },
    address: {
      type: String,
    },
    position: {
      type: String,
    },
    trade: {
      type: String,
    },
    department: {
      type: String,
    },
    salary: {
      type: Number,
    },
    ratePerHour: {
      type: Number,
    },
    overtimeRate: {
      type: Number,
    },
    employmentType: {
      type: String,
    },
    joiningDate: {
      type: Date,
    },
    joinDate: {
      type: Date,
    },
    passportNo: {
      type: String,
    },
    passportExpiry: {
      type: Date,
    },
    passportStatus: {
      type: String,
      enum: ['valid', 'expiring-soon', 'expired'],
      default: 'valid',
    },
    passportCopy: {
      type: String,
    },
    emiratesId: {
      type: String,
    },
    emiratesIdExpiry: {
      type: Date,
    },
    emirateIdStatus: {
      type: String,
      enum: ['valid', 'expiring-soon', 'expired'],
      default: 'valid',
    },
    emiratesIdCopy: {
      type: String,
    },
    laborCardCopy: {
      type: String,
    },
    medicalCertificateCopy: {
      type: String,
    },
    residenceIdCopy: {
      type: String,
    },
    contractPaperCopy: {
      type: String,
    },
    expenses: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },
    expenseReceipts: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },
    avatar: {
      type: String,
    },
    appUserId: {
      type: String,
    },
    appPassword: {
      type: String,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'resigned'],
      default: 'active',
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      default: null,
    },
  },
  { timestamps: true }
);

const Employee = mongoose.model('Employee', employeeSchema);
export default Employee;
