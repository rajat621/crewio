// backend/src/models/LegalAcceptance.js
//
// Append-only audit trail of every legal-agreement acceptance. Never
// updated or deleted - each acceptance (signup, or re-consent after a
// version bump) gets its own permanent record for compliance evidence.
// The User model additionally keeps a denormalized `legalAcceptance`
// snapshot of the *latest* record for fast "does this user need to
// re-accept" checks without a join.
import mongoose from 'mongoose';

const legalAcceptanceSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // Bundle version accepted (see config/legalDocuments.js LEGAL_BUNDLE_VERSION).
    version: { type: String, required: true },

    // Snapshot of each individual document's version at the moment of
    // acceptance, so the audit record is self-contained even if the
    // documents config changes later.
    documents: {
      type: [
        {
          slug: { type: String, required: true },
          title: { type: String },
          version: { type: String },
          _id: false,
        },
      ],
      default: [],
    },

    acceptedAt: { type: Date, required: true, default: Date.now },
    acceptedIp: { type: String, default: '' },
    acceptedUserAgent: { type: String, default: '' },

    // How the acceptance was captured - the signup checkbox, or the
    // mandatory re-consent gate shown after a legal-document version bump.
    flow: { type: String, enum: ['signup', 'reconsent'], required: true },
  },
  { timestamps: true }
);

// Immutable by convention: no update/delete routes are exposed for this
// collection anywhere in the API.
const LegalAcceptance = mongoose.model('LegalAcceptance', legalAcceptanceSchema);
export default LegalAcceptance;
