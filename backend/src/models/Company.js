import mongoose from 'mongoose';

const companySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    trn: {
      type: String,
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
  },
  { timestamps: true }
);

const Company = mongoose.model('Company', companySchema);
export default Company;
