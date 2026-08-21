import mongoose from 'mongoose';

const companySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: function requiredCompanyName() {
        return !this.isOwner;
      },
    },
    trn: {
      type: String,
    },
    // The calendar month (and year) the company was legally registered,
    // collected during onboarding right after TRN. Stored as "YYYY-MM"
    // (same format as the dashboard's month-filter components) rather than
    // a full Date, since only the month/year is ever collected or shown.
    registrationMonth: {
      type: String,
    },
    // The deadline period ("YYYY-MM" of the deadline month) that was last
    // marked paid via the Smart Alerts "Mark as Paid" action. The VAT alert
    // stays hidden for the CURRENT deadline period once this matches it,
    // and reappears automatically once a new deadline period begins (see
    // vatDeadline.util.js).
    vatLastPaidPeriod: {
      type: String,
      default: null,
    },
    companyLegalName: {
      type: String,
    },
    websiteLink: {
      type: String,
    },
    logo: {
      type: String,
    },
    stamp: {
      type: String,
    },
    invoiceTemplate: {
      type: String,
    },
    isOwner: {
      type: Boolean,
      default: false,
    },
    companyRole: {
      type: String,
      enum: ['owner', 'client'],
      default: 'client',
      index: true,
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
      index: true,
    },
    poBox: {
      type: String,
    },
    faxNumber: {
      type: String,
    },
    telephoneNumber: {
      type: String,
    },
    signature: {
      type: String,
    },
    invoiceTemplateConfig: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({
        templateId: 'branded-enterprise-v1',
        headerBoundaryY: 120,
        footerBoundaryY: 120,
        tableStartY: 320,
        safeContentLeft: 38,
        safeContentRight: 38,
        signatureAreaX: 48,
        signatureAreaY: 55,
        signatureAreaWidth: 150,
        signatureAreaHeight: 90,
        currencyCode: 'AED',
        footerNotes: '',
        safeZones: {},
        coordinates: {},
        columnLayout: {},
        footerRules: {},
        paginationRules: {},
        renderRules: {},
      }),
    },
    address: {
      type: String,
    },
    city: {
      type: String,
    },
    nationality: {
      type: String,
    },
    contactEmail: {
      type: String,
    },
    mobileNumber: {
      type: String,
    },
    countryCode: {
      type: String,
    },
    countryIso: {
      type: String,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    onboardingCompleted: {
      type: Boolean,
      default: false,
    },
    logoFileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FileRecord',
    },
    templateFileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FileRecord',
    },
    signatureFileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FileRecord',
    },
  },
  { timestamps: true }
);

// Matches getCompanies/getClientCompanies' actual filter+sort shape
// ({ownerId, companyRole/$or} sorted by createdAt) - the existing
// single-field ownerId index only narrows the candidate set, leaving the
// role filter and sort unindexed.
companySchema.index({ ownerId: 1, companyRole: 1, createdAt: -1 });

const Company = mongoose.model('Company', companySchema);
export default Company;


