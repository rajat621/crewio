import mongoose from 'mongoose';
import Company from '../models/Company.js';
import { serverError } from '../utils/apiResponse.js';
import User from '../models/User.js';
import {Invoice} from '../models/Invoice.js';
import { getActiveVatPeriod, MONTH_NAMES } from '../utils/vatDeadline.util.js';
import Employee from '../models/Employee.js';
import Attendance from '../models/Attendance.js';
import { employeeCachePrefix } from './employee.controller.js';
import { cacheGetOrSet, cacheInvalidate } from '../utils/cache.util.js';
import { invalidateAuthCache } from '../middleware/auth.middleware.js';
import TemplateProfile from '../models/TemplateProfile.js';

// GET /api/companies/owner/vat-summary - Smart Alerts "Tax to pay". Returns
// active:false whenever there's nothing to show (no registration month set,
// today isn't a deadline month, or this period was already marked paid) -
// the frontend simply omits the alert in that case rather than treating it
// as an error.
const vatSummaryCacheKey = (ownerId) => `vatSummary:${ownerId}`;

export const getVatSummary = async (req, res) => {
  try {
    if (!getAuthenticatedUserId(req)) return res.status(404).json({ message: 'User not found' });
    const ownerId = getAuthenticatedOwnerId(req);

    // Was fully uncached - measured 546ms-3.2s on every Home-page load
    // (Smart Alerts calls this unconditionally). 60s TTL: this is a
    // periodic "tax due" summary, not live transactional data, so a
    // near-minute staleness window is an acceptable tradeoff for cutting
    // it to a single Redis round-trip on every request but the first.
    // Explicitly invalidated by markVatPaid below (below the 60s window,
    // a user marking a period paid should see the alert clear
    // immediately, not wait it out) - not wired to every invoice mutation
    // site, since a ~1-minute lag on a newly-created invoice nudging this
    // total is an acceptable tradeoff against the real risk of missing one
    // of the several invoice create/update/delete/approve call sites.
    return res.json(await cacheGetOrSet(vatSummaryCacheKey(ownerId), 60, async () => {
      const company = await Company.findOne({ ownerId, companyRole: 'owner', isOwner: true });
      if (!company || !company.registrationMonth) {
        return { active: false };
      }

      const period = getActiveVatPeriod(company.registrationMonth, new Date(), company.vatLastPaidPeriod);
      if (!period) {
        return { active: false };
      }

      const invoices = await Invoice.find({
        ownerId,
        invoiceDate: { $gte: period.periodStart, $lte: period.periodEnd },
      })
        .select('invoiceDate vatAmount company')
        .populate('company', 'name');

      // Grouped by (client company, month, year) - the owner collects VAT
      // FROM each client company via the tax invoices issued to them, and
      // owes the sum of all of it to the tax authority. Only rows with
      // actual invoice activity are included (no owner-company placeholder
      // rows - there can be any number of distinct client companies, or
      // none, in a given period).
      const rowsByKey = new Map();
      for (const inv of invoices) {
        const d = new Date(inv.invoiceDate);
        const companyName = inv.company?.name || 'Unknown company';
        const key = `${inv.company?._id || 'unknown'}|${d.getFullYear()}|${d.getMonth()}`;
        const existing = rowsByKey.get(key);
        if (existing) {
          existing.vatAmount += Number(inv.vatAmount || 0);
        } else {
          rowsByKey.set(key, {
            companyName,
            month: MONTH_NAMES[d.getMonth()],
            year: d.getFullYear(),
            vatAmount: Number(inv.vatAmount || 0),
          });
        }
      }

      // Stable ordering: chronological, then by company name within a month.
      const breakdown = [...rowsByKey.values()].sort((a, b) => {
        if (a.year !== b.year) return a.year - b.year;
        const aMonthIndex = MONTH_NAMES.indexOf(a.month);
        const bMonthIndex = MONTH_NAMES.indexOf(b.month);
        if (aMonthIndex !== bMonthIndex) return aMonthIndex - bMonthIndex;
        return a.companyName.localeCompare(b.companyName);
      });

      const total = breakdown.reduce((sum, row) => sum + row.vatAmount, 0);

      return {
        active: true,
        deadlinePeriod: period.deadlinePeriod,
        deadlineMonthName: period.deadlineMonthName,
        deadlineYear: period.deadlineYear,
        deadlineDate: period.deadlineDate,
        breakdown,
        total,
      };
    }));
  } catch (error) {
    console.error('Get VAT summary error:', error);
    return serverError(res, 'Failed to compute VAT summary');
  }
};

// POST /api/companies/owner/vat-mark-paid - dismisses the alert for the
// CURRENTLY active period only (recomputed server-side, never trusts a
// client-supplied period string) - it reappears automatically once the
// next deadline period begins.
export const markVatPaid = async (req, res) => {
  try {
    if (!getAuthenticatedUserId(req)) return res.status(404).json({ message: 'User not found' });
    const ownerId = getAuthenticatedOwnerId(req);

    const company = await Company.findOne({ ownerId, companyRole: 'owner', isOwner: true });
    if (!company || !company.registrationMonth) {
      return res.status(400).json({ message: 'No VAT period is currently active' });
    }

    const period = getActiveVatPeriod(company.registrationMonth, new Date(), company.vatLastPaidPeriod);
    if (!period) {
      return res.status(400).json({ message: 'No VAT period is currently active' });
    }

    company.vatLastPaidPeriod = period.deadlinePeriod;
    await company.save();
    await cacheInvalidate(vatSummaryCacheKey(ownerId));

    return res.json({ message: 'Marked as paid', deadlinePeriod: period.deadlinePeriod });
  } catch (error) {
    console.error('Mark VAT paid error:', error);
    return serverError(res, 'Failed to mark VAT as paid');
  }
};

const getAuthenticatedUser = async (req) => {
  const userId = req.user?.userId;
  if (!userId) return null;
  // Excludes logo/stamp/signature - found via direct measurement: this
  // tenant's company document is 1.44MB, almost entirely one base64-
  // inline logo field, making every unprojected populate('company') here
  // transfer that whole image just to check {_id, isOwner, companyRole}
  // flags. Verified safe: every caller of getAuthenticatedUser() either
  // reads those flags off user.company or (updateOwnerCompany) re-fetches
  // its own separate, unprojected Company document for the actual
  // mutation - none of them read image data through this populate.
  return User.findById(userId).populate('company', '-logo -stamp -signature');
};

// authenticateToken (see auth.middleware.js) already resolves userId/
// ownerId/companyId onto req.user via a cached lookup - most handlers below
// only ever used getAuthenticatedUser() for that same {_id, ownerId} pair
// (never any other field off the user document), which meant every one of
// them repeated a full, uncached `User.findById().populate('company')` on
// top of the auth middleware's own lookup. This is the same shape of
// redundant per-request DB round trip fixed in auth.middleware.js's own
// cache, just duplicated here - this checks the already-authenticated
// request instead of hitting Mongo again. Only handlers that actually
// mutate and .save() the user document (getOwnerCompany, updateOwnerCompany)
// still need the real hydrated getAuthenticatedUser() fetch.
const getAuthenticatedUserId = (req) => req.user?.userId || null;

const getAuthenticatedOwnerId = (req, user) => req.user?.ownerId || user?._id || req.user?.userId || null;

const buildEmptyOwnerCompany = (ownerId) => ({
  owner: ownerId,
  ownerId,
  companyRole: 'owner',
  isOwner: true,
  name: '',
  companyLegalName: '',
  trn: '',
  websiteLink: '',
  address: '',
  city: '',
  nationality: '',
  contactEmail: '',
  mobileNumber: '',
  countryCode: '',
  onboardingCompleted: false,
});

const ensureOwnerCompany = async (user, req) => {
  const ownerId = getAuthenticatedOwnerId(req, user);
  if (!ownerId) return null;

  let company = await Company.findOne({
    ownerId,
    companyRole: 'owner',
    isOwner: true,
  });

  if (!company) {
    company = await Company.create(buildEmptyOwnerCompany(ownerId));
  }

  if (String(company.owner || '') !== String(ownerId)) {
    company.owner = ownerId;
    await company.save();
  }

  if (!user.company || String(user.company?._id || user.company) !== String(company._id)) {
    user.company = company._id;
  }

  const completed = Boolean(company.onboardingCompleted);
  if (user.onboardingCompleted !== completed) {
    user.onboardingCompleted = completed;
  }

  await user.save();
  await invalidateAuthCache(user._id);
  return company;
};

const estimateDataUrlBytes = (dataUrl) => {
  if (!dataUrl || typeof dataUrl !== 'string') return 0;
  const base64Part = dataUrl.split(',')[1];
  return base64Part ? Math.ceil((base64Part.length * 3) / 4) : 0;
};

const validateAssetField = (fieldName, value) => {
  if (!value) return null;

  const maxSizeImage = 5 * 1024 * 1024;
  const maxSizePdf = 10 * 1024 * 1024;

  if (!value.startsWith('data:')) {
    return `${fieldName} must be provided as a data URL string`;
  }

  const bytes = estimateDataUrlBytes(value);
  const mimeType = value.split(';')[0].replace('data:', '');

  if (mimeType.startsWith('image/')) {
    if (bytes > maxSizeImage) {
      return `${fieldName} image size exceeds 5MB limit`;
    }
  } else if (mimeType === 'application/pdf') {
    if (bytes > maxSizePdf) {
      return `${fieldName} PDF size exceeds 10MB limit`;
    }
  } else {
    return `${fieldName} has unsupported MIME type: ${mimeType}`;
  }

  return null;
};

export const createCompany = async (req, res) => {
  try {
    const ownerId =
  req.user?.ownerId ||
  req.employee?.ownerId;
const user = req.user;

if (!user) {
  return res.status(401).json({
    message: 'User not authenticated'
  });
}

if (!ownerId) {
  return res.status(401).json({
    message: 'User not authenticated'
  });
}
    const { name, trn, websiteLink, stamp, invoiceTemplate, signature,
      address, telephoneNumber, poBox, faxNumber, city } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'Company name is required' });
    }

    // Validate asset fields
    let assetError = validateAssetField('stamp', stamp);
    if (assetError) return res.status(400).json({ message: assetError });

    assetError = validateAssetField('invoiceTemplate', invoiceTemplate);
    if (assetError) return res.status(400).json({ message: assetError });

    assetError = validateAssetField('signature', signature);
    if (assetError) return res.status(400).json({ message: assetError });

    const company = new Company({
      name,
      trn,
      websiteLink,
      stamp,
      invoiceTemplate,
      signature,
      owner: user.userId,
      ownerId: user.ownerId,
      createdBy: user.userId,
      companyRole: 'client',
      isOwner: false,
      ...(address !== undefined && { address }),
      ...(telephoneNumber !== undefined && { telephoneNumber }),
      ...(poBox !== undefined && { poBox }),
      ...(faxNumber !== undefined && { faxNumber }),
      ...(city !== undefined && { city }),
    });

    await company.save();
    console.log('Create company: ownerId=', user.ownerId, 'createdBy=', user.userId, 'companyId=', company._id);
    await cacheInvalidate(employeeCachePrefix(user.ownerId));

    res.status(201).json({
      message: 'Company created successfully',
      data: company,
    });
  } catch (error) {
    console.error('Create company error:', error);
    return serverError(res, 'Failed to create company');
  }
};

export const updateOwnerCompany = async (req, res) => {
  try {
    console.log('updateOwnerCompany payload:', JSON.stringify(req.body));
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const {
      name,
      trn,
      websiteLink,
      stamp,
      invoiceTemplate,
      signature,
      companyRole,
      isOwner,
      owner,
      ownerId,
      _id,
      ...otherFields
    } = req.body;

    // Validate asset fields
    let assetError = validateAssetField('stamp', stamp);
    if (assetError) return res.status(400).json({ message: assetError });

    assetError = validateAssetField('invoiceTemplate', invoiceTemplate);
    if (assetError) return res.status(400).json({ message: assetError });

    assetError = validateAssetField('signature', signature);
    if (assetError) return res.status(400).json({ message: assetError });

    const updateData = {
      ...otherFields,
      ...(name !== undefined && { name }),
      ...(trn !== undefined && { trn }),
      ...(websiteLink !== undefined && { websiteLink }),
      ...(stamp !== undefined && { stamp }),
      ...(invoiceTemplate !== undefined && { invoiceTemplate }),
      ...(signature !== undefined && { signature }),
    };

    const authUser = user;
    const authenticatedOwnerId = getAuthenticatedOwnerId(req, authUser);
    let company = await Company.findOne({
      ownerId: authenticatedOwnerId,
      companyRole: 'owner',
      isOwner: true,
    });

    if (!company) {
      company = new Company({
        ...buildEmptyOwnerCompany(authenticatedOwnerId),
        ...otherFields,
        ...(name !== undefined && { name }),
        ...(trn !== undefined && { trn }),
        ...(websiteLink !== undefined && { websiteLink }),
        ...(stamp !== undefined && { stamp }),
        ...(invoiceTemplate !== undefined && { invoiceTemplate }),
        ...(signature !== undefined && { signature }),
      });
    } else {
      Object.assign(company, updateData);
      // Ensure owner flag is set for existing owner companies
      if (!company.isOwner) company.isOwner = true;
      company.companyRole = 'owner';
      company.owner = user._id;
    }

    company.isOwner = true;
    company.companyRole = 'owner';
    company.owner = authenticatedOwnerId;
    company.ownerId = authenticatedOwnerId;
    await company.save();

    if (!authUser.company || String(authUser.company?._id || authUser.company) !== String(company._id)) {
      authUser.company = company._id;
    }
    authUser.onboardingCompleted = Boolean(company.onboardingCompleted);
    await authUser.save();

    res.json({
      message: 'Company profile updated successfully',
      data: company,
    });
  } catch (error) {
    console.error('Update owner company error:', error);
    return serverError(res, 'Failed to update company');
  }
};

// Excluded from the default (non-includeAssets) response - none of this
// function's own logic below (isOwner/companyRole migration checks,
// user.company assignment) ever reads these 4 fields off `company`, so
// excluding them at the query level is safe and genuinely cuts what Atlas
// sends back, not just what the HTTP response includes.
const OWNER_COMPANY_ASSET_FIELDS = ['logo', 'stamp', 'signature', 'invoiceTemplate'];
const ASSET_EXCLUDE_PROJECTION = OWNER_COMPANY_ASSET_FIELDS.map((f) => `-${f}`).join(' ');

export const getOwnerCompany = async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Real, measured finding: this endpoint shipped ~1.44MB on every call
    // (CompanyProfile, GenerateSalarySlip, and - unnecessarily -
    // ProfileCard.jsx's fallback path, which never reads any of these 4
    // fields at all). `includeAssets=true` preserves the exact legacy
    // shape for consumers that genuinely display/embed the binary data
    // (CompanyProfile.jsx, OnboardingCompanyProfile.jsx); everyone else
    // gets lightweight metadata + hasLogo/hasStamp/hasSignature/
    // hasInvoiceTemplate booleans and fetches the actual bytes on demand
    // from GET /api/companies/owner/assets/:field only when needed.
    const includeAssets = req.query.includeAssets === 'true';
    const assetProjection = includeAssets ? '' : ASSET_EXCLUDE_PROJECTION;

    const ownerId = getAuthenticatedOwnerId(req, user);
    let company = await Company.findOne({
      ownerId,
      companyRole: 'owner',
      isOwner: true,
    }).select(assetProjection);

    if (!company && user.company) {
      company = await Company.findOneAndUpdate(
        { _id: user.company._id || user.company, ownerId },
        { isOwner: true, companyRole: 'owner', owner: ownerId, ownerId },
        { new: true, select: assetProjection }
      );
    }

    if (!company) {
      company = await ensureOwnerCompany(user, req);
    }

    if (!user.company || String(user.company?._id || user.company) !== String(company._id)) {
      user.company = company._id;
      await user.save();
      await invalidateAuthCache(user._id);
    }

    // Ensure isOwner flag is set (migration for pre-existing records)
    if (!user.company.isOwner || user.company.companyRole !== 'owner') {
      await Company.findByIdAndUpdate(user.company._id, { isOwner: true, companyRole: 'owner', owner: user._id });
      user.company.isOwner = true;
      user.company.companyRole = 'owner';
    }

    if (includeAssets) {
      return res.json({ data: company });
    }

    // Existence-only check, computed server-side via $strLenCP so the
    // actual base64 bytes never leave Atlas just to answer "does a logo
    // exist" - the frontend uses these to decide whether to render an
    // upload prompt or an asset preview, without needing the bytes yet.
    const [assetFlags] = await Company.aggregate([
      { $match: { _id: company._id } },
      {
        $project: {
          hasLogo: { $gt: [{ $strLenCP: { $ifNull: ['$logo', ''] } }, 0] },
          hasStamp: { $gt: [{ $strLenCP: { $ifNull: ['$stamp', ''] } }, 0] },
          hasSignature: { $gt: [{ $strLenCP: { $ifNull: ['$signature', ''] } }, 0] },
          hasInvoiceTemplate: { $gt: [{ $strLenCP: { $ifNull: ['$invoiceTemplate', ''] } }, 0] },
        },
      },
    ]);

    res.json({
      data: {
        ...company.toObject(),
        hasLogo: Boolean(assetFlags?.hasLogo),
        hasStamp: Boolean(assetFlags?.hasStamp),
        hasSignature: Boolean(assetFlags?.hasSignature),
        hasInvoiceTemplate: Boolean(assetFlags?.hasInvoiceTemplate),
      },
    });
  } catch (error) {
    console.error('Get owner company error:', error);
    return serverError(res, 'Failed to fetch company');
  }
};

// GET /api/companies/owner/assets/:field - on-demand binary fetch for one
// of the 4 base64-inline asset fields, scoped to the authenticated owner.
// Decodes the stored data-URI once here and streams real bytes with a real
// Content-Type/Cache-Control, instead of shipping ~1.44MB of base64-
// inflated JSON on every getOwnerCompany call regardless of whether the
// caller actually needs image data this time.
export const getOwnerCompanyAsset = async (req, res) => {
  try {
    const field = String(req.params.field || '');
    if (!OWNER_COMPANY_ASSET_FIELDS.includes(field)) {
      return res.status(404).json({ message: 'Unknown asset field' });
    }

    const ownerId = getAuthenticatedOwnerId(req);
    if (!ownerId) return res.status(401).json({ message: 'User not authenticated' });

    // ownerId-scoped lookup is the entire tenant boundary here - the same
    // guarantee every other owner-only endpoint in this file relies on.
    const company = await Company.findOne({ ownerId, companyRole: 'owner', isOwner: true }).select(field);
    const dataUri = company?.[field];
    if (!dataUri) return res.status(404).json({ message: 'Asset not found' });

    const match = /^data:([^;]+);base64,(.+)$/.exec(dataUri);
    if (!match) return res.status(404).json({ message: 'Asset not found' });

    const [, mimeType, base64Payload] = match;
    const buffer = Buffer.from(base64Payload, 'base64');

    // Private (tenant-owned, not a public CDN asset) but safely
    // client-cacheable for a while - re-uploading a logo/stamp/signature
    // is rare, and the browser only re-fetches on demand (page nav, hard
    // reload), so a 5-minute window meaningfully cuts repeat fetches
    // without risking a stale asset sticking around after a real edit.
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('Content-Type', mimeType);
    return res.send(buffer);
  } catch (error) {
    console.error('Get owner company asset error:', error);
    return serverError(res, 'Failed to fetch asset');
  }
};

export const updateCompany = async (req, res) => {
  try {
    const userId = getAuthenticatedUserId(req);
    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const { id } = req.params;
    const updateData = req.body;
    const ownerId = req.user?.ownerId || userId;

    const company = await Company.findOneAndUpdate(
      {
        _id: id,
        ownerId,
        $or: [
          { companyRole: 'client' },
          { companyRole: { $exists: false }, isOwner: { $ne: true } },
        ],
      },
      { ...updateData, ownerId, companyRole: 'client', isOwner: false },
      { new: true }
    );
    if (!company) {
      return res.status(404).json({ message: 'Company not found' });
    }

    await cacheInvalidate(employeeCachePrefix(ownerId));

    res.json({
      message: 'Company updated successfully',
      data: company,
    });
  } catch (error) {
    console.error('Update company error:', error);
    return serverError(res, 'Failed to update company');
  }
};

export const createClientCompany = async (req, res) => {
  try {
    const userId = getAuthenticatedUserId(req);
    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const { name, trn, stamp, invoiceTemplate, signature,
      address, telephoneNumber, poBox, faxNumber, city } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'Company name is required' });
    }

    // Validate asset fields
    let assetError = validateAssetField('stamp', stamp);
    if (assetError) return res.status(400).json({ message: assetError });

    assetError = validateAssetField('invoiceTemplate', invoiceTemplate);
    if (assetError) return res.status(400).json({ message: assetError });

    assetError = validateAssetField('signature', signature);
    if (assetError) return res.status(400).json({ message: assetError });

    const ownerId = req.user?.ownerId || userId;
    const company = new Company({
      name,
      trn,
      stamp,
      invoiceTemplate,
      signature,
      owner: userId,
      ownerId,
      createdBy: req.user?.userId || userId,
      companyRole: 'client',
      isOwner: false,
      ...(address !== undefined && { address }),
      ...(telephoneNumber !== undefined && { telephoneNumber }),
      ...(poBox !== undefined && { poBox }),
      ...(faxNumber !== undefined && { faxNumber }),
      ...(city !== undefined && { city }),
    });

    await company.save();
    console.log('Create client company: ownerId=', ownerId, 'createdBy=', req.user?.userId || userId, 'companyId=', company._id);
    await cacheInvalidate(employeeCachePrefix(ownerId));

    res.status(201).json({
      message: 'Client company created successfully',
      data: company,
    });
  } catch (error) {
    console.error('Create client company error:', error);
    return serverError(res, 'Failed to create company');
  }
};

// 500 matches the {page:1,limit:500} convention this codebase's frontend
// hooks already use for "give me effectively everything reasonable" calls
// to this endpoint (see useActiveClientCompanies.js, useCompaniesPageData.js)
// - both getClientCompanies() (no params) and getClientCompanies({limit:500})
// callers keep their existing "see every company" behavior for any tenant
// under 500 companies, while still capping the previously-unbounded query.
const parseCompanyPagination = (req) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 500));
  return { page, limit, skip: (page - 1) * limit };
};

export const getCompanies = async (req, res) => {
  try {
    const userId = getAuthenticatedUserId(req);
    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const ownerId = req.user?.ownerId || userId;
    const { page, limit, skip } = parseCompanyPagination(req);
    const query = {
      ownerId,
      $or: [
        { companyRole: 'client' },
        { companyRole: { $exists: false }, isOwner: { $ne: true } },
      ],
    };

    // Cached like every other list endpoint in this codebase (employees,
    // salary-slips) - was previously the one hot list endpoint hitting Mongo
    // on every single request with no staleness tolerance at all, unlike its
    // siblings. Same prefix getCompanyWorkforceSummary already uses, so the
    // existing delete-time cacheInvalidate call below already covers this;
    // create/update now also invalidate it (see createCompany/updateCompany/
    // createClientCompany).
    const cacheKey = `${employeeCachePrefix(ownerId)}companies:list:${page}:${limit}`;
    const { companies, total } = await cacheGetOrSet(cacheKey, 30, async () => {
      const [companies, total] = await Promise.all([
        Company.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
        Company.countDocuments(query),
      ]);
      return { companies, total };
    });
    res.json({ data: companies, page, limit, total, hasMore: skip + companies.length < total });
  } catch (error) {
    console.error('Get companies error:', error);
    return serverError(res, 'Failed to fetch companies');
  }
};

export const getCompany = async (req, res) => {
  try {
    const userId = getAuthenticatedUserId(req);
    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const ownerId = req.user?.ownerId || userId;
    // Excludes logo/stamp/signature/invoiceTemplate - verified no frontend
    // consumer of this endpoint (CompanyDetail page, ProfileCard,
    // useShowCompanyWarning) reads any of these fields.
    const company = await Company.findOne({ _id: req.params.id, ownerId })
      .select('-logo -stamp -signature -invoiceTemplate');
    if (!company) {
      return res.status(404).json({ message: 'Company not found' });
    }
    res.json({ data: company });
  } catch (error) {
    console.error('Get company error:', error);
    return serverError(res, 'Failed to fetch company');
  }
};

export const deleteCompany = async (req, res) => {
  try {
    const userId = getAuthenticatedUserId(req);
    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    // These three writes (delete the company, unassign its employees,
    // drop its template profile) were previously three independent
    // operations - a crash/timeout between any two of them could leave
    // employees pointing at a deleted company, or a template profile
    // orphaned with no company to belong to. A session/transaction makes
    // them atomic: either all three commit or none do. Atlas clusters are
    // always replica sets, so transactions are available without any
    // extra configuration.
    const session = await mongoose.startSession();
    let deleted;
    try {
      await session.withTransaction(async () => {
        deleted = await Company.findOneAndDelete(
          {
            _id: req.params.id,
            ownerId: req.user?.ownerId || userId,
            $or: [
              { companyRole: 'client' },
              { companyRole: { $exists: false }, isOwner: { $ne: true } },
            ],
          },
          { session }
        );
        if (!deleted) return;

        // No cascade on the Employee side previously - employees still
        // assigned to this company would keep a stale company reference,
        // and getEmployee's assignedStatus display logic treats any truthy
        // company value as "still assigned" (on-site/on-hold), so they'd
        // incorrectly appear assigned after their company no longer exists.
        // Same update shape unassignEmployee already uses for this exact
        // state, scoped to the same ownerId as the deletion above.
        await Employee.updateMany(
          { company: deleted._id, ownerId: deleted.ownerId },
          { $set: { company: null, lifecycleState: 'WAITING_FOR_COMPANY', assignedStatus: 'on-hold' } },
          { session }
        );

        // TemplateProfile.companyId is schema-required (select via
        // models/TemplateProfile.js), unlike Employee.company which is
        // optional - a template profile cannot validly exist without its
        // company, so cascade delete is the correct behavior here rather
        // than orphaning. Without this, canAccessCompany's live Company
        // lookup on every TemplateProfile endpoint would permanently lock
        // the owner out of their own template configuration with no
        // recovery path, since the record survives but its authorization
        // gate can never pass again.
        await TemplateProfile.deleteMany({ companyId: deleted._id, ownerId: deleted.ownerId }, { session });
      });
    } finally {
      await session.endSession();
    }

    if (!deleted) {
      return res.status(404).json({ message: 'Company not found' });
    }

    await cacheInvalidate(employeeCachePrefix(deleted.ownerId));

    res.json({ message: 'Company deleted successfully' });
  } catch (error) {
    console.error('Delete company error:', error);
    return serverError(res, 'Failed to delete company');
  }
};

export const getClientCompanies = async (req, res) => {
  try {
    const userId = getAuthenticatedUserId(req);
    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const ownerId = req.user?.ownerId || userId;
    const { page, limit, skip } = parseCompanyPagination(req);
    const query = {
      ownerId,
      $or: [
        { companyRole: 'client' },
        { companyRole: { $exists: false }, isOwner: { $ne: true } },
      ],
    };

    // .lean() - result goes straight to res.json(), never mutated here.
    // Excludes logo/stamp/signature/invoiceTemplate - found via direct DB
    // inspection: these are base64-inline fields (up to 1.4MB for a single
    // logo on this tenant's data), and Company.jsx's list-card rendering
    // never reads any of them (verified - the list shows a generic
    // building icon per card, not the uploaded logo). Previously this
    // endpoint transferred every client company's full asset payload on
    // every Companies-page/Home load regardless of list size, with no
    // pagination on top of that.
    const cacheKey = `${employeeCachePrefix(ownerId)}companies:clients:${page}:${limit}`;
    const { companies, total } = await cacheGetOrSet(cacheKey, 30, async () => {
      const [companies, total] = await Promise.all([
        Company.find(query)
          .select('-logo -stamp -signature -invoiceTemplate')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Company.countDocuments(query),
      ]);
      return { companies, total };
    });
    res.json({ data: companies, page, limit, total, hasMore: skip + companies.length < total });
  } catch (error) {
    console.error('Get client companies error:', error);
    return serverError(res, 'Failed to fetch client companies');
  }
};

// GET /api/companies/workforce-summary - per-company {totalWorkers, present,
// absent, onLeave}, for the Companies page cards.
//
// The Companies page previously computed this in the BROWSER (see
// companyDerivation.js's computeCompanyRows) by fetching every employee
// (up to 5000, though getEmployees itself silently caps the actual query at
// 200 - so at this tenant's 1002 employees, company workforce counts were
// silently wrong for any company whose employees fell outside the most-
// recent-200-by-createdAt window) plus every raw attendance record in a
// full, non-minimal 120-day window (the same ~40k-row/~5.5s shape already
// fixed for the dashboard in attendance.controller.js - this page still had
// it). This replaces both fetches with one aggregation that returns only
// the small, already-summed numbers the UI displays - correct for the FULL
// population (not capped at 200) and with no raw employee/attendance
// documents ever leaving MongoDB.
//
// "Present/absent/on-leave" here means the same thing the original browser
// logic meant: each employee's MOST RECENT attendance record within the
// last 120 days, classified via the same normalizeAttendanceStatus mapping
// (leave -> on-leave, half-day -> present). An employee with no attendance
// record in that window counts toward totalWorkers but none of the three
// status buckets - identical to the original's behavior (latestStatus
// would be '' for them, matching none of the three checks).
export const getCompanyWorkforceSummary = async (req, res) => {
  try {
    const userId = getAuthenticatedUserId(req);
    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }
    const ownerId = req.user?.ownerId || userId;

    const cacheKey = `${employeeCachePrefix(ownerId)}company-workforce-summary`;
    const summary = await cacheGetOrSet(cacheKey, 30, async () => {
      const ownerObjectId = new mongoose.Types.ObjectId(ownerId);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 120);
      cutoff.setHours(0, 0, 0, 0);

      const rows = await Employee.aggregate([
        { $match: { ownerId: ownerObjectId, company: { $ne: null } } },
        {
          // Index-backed (Attendance has {employee:1, date:-1}) - one
          // indexed, limit-1 lookup per employee, entirely server-side.
          $lookup: {
            from: 'attendances',
            let: { empId: '$_id' },
            pipeline: [
              { $match: { $expr: { $and: [{ $eq: ['$employee', '$$empId'] }, { $gte: ['$date', cutoff] }] } } },
              { $sort: { date: -1 } },
              { $limit: 1 },
              { $project: { _id: 0, status: 1 } },
            ],
            as: 'latestAttendance',
          },
        },
        {
          $project: {
            company: 1,
            status: { $arrayElemAt: ['$latestAttendance.status', 0] },
          },
        },
        {
          $group: {
            _id: '$company',
            totalWorkers: { $sum: 1 },
            present: { $sum: { $cond: [{ $in: ['$status', ['present', 'half-day']] }, 1, 0] } },
            onLeave: { $sum: { $cond: [{ $eq: ['$status', 'leave'] }, 1, 0] } },
            absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
          },
        },
      ]);

      return rows.reduce((acc, row) => {
        acc[String(row._id)] = {
          totalWorkers: row.totalWorkers,
          present: row.present,
          absent: row.absent,
          onLeave: row.onLeave,
        };
        return acc;
      }, {});
    });

    res.json({ data: summary });
  } catch (error) {
    console.error('Get company workforce summary error:', error);
    return serverError(res, 'Failed to fetch company workforce summary');
  }
};


