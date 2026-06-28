import mongoose from "mongoose";

const ownerCompanySchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },

    companyName: String,

    registrationNumber: String,

    taxNumber: String,

    address: String,

    city: String,

    state: String,

    country: String,

    contactEmail: String,

    contactPhone: String,

    website: String,

    invoiceAlertDate: Date,

    logoFileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FileAsset",
    },

    signatureFileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FileAsset",
    },
    onboardingCompleted: {
   type: Boolean,
   default: false
},
  },
  {
    timestamps: true,
  }
  
);

export default mongoose.model(
  "OwnerCompany",
  ownerCompanySchema
);