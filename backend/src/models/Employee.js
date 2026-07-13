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
      select: false, // was previously returned on every Employee.find() - fixed
    },
    // appPassword above is a one-way bcrypt hash (used for actual mobile
    // login comparison) and can never be recovered back to the original
    // text. This is a separate, plain-text copy kept ONLY so the office can
    // look up an employee's app login credential later from the App Access
    // tab (e.g. to read it out to them) - select:false by default so it
    // still never leaks on general employee list/search endpoints, only
    // explicitly selected on the single-employee detail fetch.
    appPasswordPlain: {
      type: String,
      default: null,
      select: false,
    },
    // Bumped on logout/password-change to instantly invalidate every JWT
    // issued before that point, since JWTs otherwise can't be revoked.
    tokenVersion: {
      type: Number,
      default: 0,
    },
    failedLoginAttempts: {
      type: Number,
      default: 0,
    },
    lockUntil: {
      type: Date,
      default: null,
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
    // --- Employee lifecycle state machine -----------------------------------
    // WAITING_FOR_COMPANY -> ASSIGNED -> CHECKED_IN -> WORKING -> (back to
    // CHECKED_IN on Stop Work) -> WAITING_FOR_COMPANY on Site Finished.
    // ON_LEAVE can be entered from ASSIGNED/CHECKED_IN and returns to the
    // state the employee was in before Take Leave was pressed.
    lifecycleState: {
      type: String,
      enum: ['WAITING_FOR_COMPANY', 'ASSIGNED', 'CHECKED_IN', 'WORKING', 'ON_LEAVE'],
      default: 'WAITING_FOR_COMPANY',
      index: true,
    },
    // Dashboard-facing 3-state assignment lifecycle (separate from the more
    // granular lifecycleState above, which only matters once assignedStatus
    // is 'on-site'). Distinguishes *why* an employee has no active site:
    // 'on-hold'   - never assigned, or an admin explicitly unassigned them
    // 'site-over' - the employee themselves completed their site (Site
    //               Finished) and is waiting for a new assignment
    // 'on-site'   - currently assigned and allowed to work
    // Mobile only cares whether this is 'on-site' or not (both non-on-site
    // states show the same "Waiting for Site" screen) - the distinction
    // exists for the dashboard's KPIs/status badge/3-dot menu.
    assignedStatus: {
      type: String,
      enum: ['on-site', 'on-hold', 'site-over'],
      default: 'on-hold',
      index: true,
    },
    // Snapshot of the state to restore to once End Leave is pressed.
    preLeaveState: {
      type: String,
      enum: ['WAITING_FOR_COMPANY', 'ASSIGNED', 'CHECKED_IN', 'WORKING', null],
      default: null,
    },
    currentLeave: {
      isOnLeave: { type: Boolean, default: false },
      startedAt: { type: Date, default: null },
      reason: { type: String, default: '' },
    },
    // FCM registration token for push notifications to this employee's device.
    fcmToken: {
      type: String,
      default: null,
      select: false,
    },
    // Device binding - the device identifier the account is currently bound
    // to. Set on first successful login; subsequent logins from a different
    // device are rejected unless an admin resets it (see mobileAuth.controller.js).
    boundDeviceId: {
      type: String,
      default: null,
      select: false,
    },
    lastSeen: {
      type: Date,
      default: null,
    },
    lastLocation: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  { timestamps: true }
);

const Employee = mongoose.model('Employee', employeeSchema);
export default Employee;