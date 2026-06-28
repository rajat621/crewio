import Company from '../models/Company.js';

export const getAuthContext = (req) => {
  const u = req.user || {};
  return {
    userId: u.userId || null,
    ownerId: u.ownerId || null,
    companyId: u.companyId || null,
    role: u.role || null,
  };
};

export const ensureOwnerPresent = (req) => {
  const ctx = getAuthContext(req);
  return Boolean(ctx.ownerId || ctx.userId);
};

export const isCompanyAccessible = async (req, companyId) => {
  if (!companyId) return false;
  const ctx = getAuthContext(req);

  // If user is directly linked to company
  if (ctx.companyId && String(ctx.companyId) === String(companyId)) return true;

  // Otherwise check company owner matches authenticated ownerId/userId
  const ownerId = ctx.ownerId || ctx.userId;
  if (!ownerId) return false;

  const c = await Company.findOne({ _id: companyId, owner: ownerId }).select('_id');
  return Boolean(c);
};

export default { getAuthContext, ensureOwnerPresent, isCompanyAccessible };
