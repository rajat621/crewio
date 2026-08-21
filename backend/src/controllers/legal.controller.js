// backend/src/controllers/legal.controller.js
import User from '../models/User.js';
import { serverError } from '../utils/apiResponse.js';
import LegalAcceptance from '../models/LegalAcceptance.js';
import {
  LEGAL_BUNDLE_VERSION,
  LEGAL_EFFECTIVE_DATE,
  LEGAL_LAST_UPDATED,
  LEGAL_DOCUMENT_LIST,
  LEGAL_DOCUMENTS,
  getLegalDocument,
} from '../config/legalDocuments.js';

// Best-effort real client IP, consistent with the rest of the API (see
// app.set('trust proxy', 1) in app.js).
const getClientIp = (req) =>
  req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || '';

const getUserAgent = (req) => req.headers['user-agent'] || '';

// Snapshot of every document's own version/title at the moment of
// acceptance, embedded into the audit record so it's self-contained.
const documentSnapshot = () =>
  Object.values(LEGAL_DOCUMENTS).map((doc) => ({
    slug: doc.slug,
    title: doc.title,
    version: doc.version,
  }));

/**
 * Records a legal-agreement acceptance for a user. Shared by the signup
 * flow (auth.controller.js) and the authenticated re-consent endpoint below
 * so both paths produce an identical, permanent audit record.
 */
export const recordLegalAcceptance = async ({ userId, req, flow }) => {
  const acceptedAt = new Date();
  const acceptedIp = getClientIp(req);
  const acceptedUserAgent = getUserAgent(req);

  await LegalAcceptance.create({
    user: userId,
    version: LEGAL_BUNDLE_VERSION,
    documents: documentSnapshot(),
    acceptedAt,
    acceptedIp,
    acceptedUserAgent,
    flow,
  });

  await User.findByIdAndUpdate(userId, {
    legalAcceptance: {
      version: LEGAL_BUNDLE_VERSION,
      acceptedAt,
      acceptedIp,
      acceptedUserAgent,
    },
  });

  return { version: LEGAL_BUNDLE_VERSION, acceptedAt, acceptedIp, acceptedUserAgent };
};

// GET /api/legal/documents - metadata only, used to render the signup
// checkbox links and the Account & Security > Legal & Privacy list.
export const listDocuments = async (_req, res) => {
  res.json({
    message: 'Legal documents',
    bundleVersion: LEGAL_BUNDLE_VERSION,
    effectiveDate: LEGAL_EFFECTIVE_DATE,
    lastUpdated: LEGAL_LAST_UPDATED,
    data: LEGAL_DOCUMENT_LIST,
  });
};

// GET /api/legal/documents/:slug - full content for one document.
export const getDocument = async (req, res) => {
  const doc = getLegalDocument(req.params.slug);
  if (!doc) {
    return res.status(404).json({ message: 'Legal document not found' });
  }
  res.json({ message: 'Legal document', data: doc });
};

// GET /api/legal/status - whether the signed-in user is current on the
// legal bundle, and what their last acceptance looked like.
export const getStatus = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ message: 'Not authenticated' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    return res.json({
      message: 'Legal status',
      data: {
        currentVersion: LEGAL_BUNDLE_VERSION,
        effectiveDate: LEGAL_EFFECTIVE_DATE,
        lastUpdated: LEGAL_LAST_UPDATED,
        acceptedVersion: user.legalAcceptance?.version || null,
        acceptedAt: user.legalAcceptance?.acceptedAt || null,
        mustReaccept: user.needsLegalReacceptance(),
      },
    });
  } catch (error) {
    return serverError(res, 'Failed to load legal status');
  }
};

// POST /api/legal/accept - authenticated re-consent endpoint. Used by the
// re-consent gate shown on login after any legal document version changes,
// and can also be called by an already-verified user who somehow reached
// the app without a signup-time acceptance (e.g. Google sign-up).
export const acceptLegal = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ message: 'Not authenticated' });

    if (req.body?.accepted !== true) {
      return res.status(400).json({
        message: 'You must accept the legal agreements before creating your account.',
      });
    }

    const result = await recordLegalAcceptance({ userId, req, flow: 'reconsent' });

    return res.json({
      message: 'Legal agreements accepted',
      data: { ...result, mustReaccept: false },
    });
  } catch (error) {
    return serverError(res, 'Failed to record acceptance');
  }
};

export default { listDocuments, getDocument, getStatus, acceptLegal, recordLegalAcceptance };
