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
    signature: {
      type: String,
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
