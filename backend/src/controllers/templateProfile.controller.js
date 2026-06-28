<<<<<<< HEAD
﻿import {
=======
import {
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
  getActiveTemplateProfile,
  getTemplateProfileById,
  listTemplateVersions,
  createTemplateProfile,
  updateTemplateProfile,
  activateTemplateProfile,
  rollbackTemplateProfile,
  deprecateTemplateProfile,
  getProfileAuditTrail,
  deleteTemplateProfile,
} from '../services/templateProfile.service.js';
import Company from '../models/Company.js';
import User from '../models/User.js';

const getAuthContext = async (req) => {
  const userId = req.user?.userId || req.user?._id || req.user?.id;
<<<<<<< HEAD
  const ownerId = req.user?.ownerId || null;
  if (!userId) return null;
  const user = await User.findById(userId).select('company');
  if (!user) return null;
  return { userId, ownerId, user };
};

const canAccessCompany = async ({ userId, ownerId, user }, companyId) => {
  if (!companyId) return false;
  if (user?.company && String(user.company) === String(companyId)) return true;
  const ownedCompany = await Company.findOne({ _id: companyId, ownerId: ownerId || userId }).select('_id');
=======
  if (!userId) return null;
  const user = await User.findById(userId).select('company');
  if (!user) return null;
  return { userId, user };
};

const canAccessCompany = async ({ userId, user }, companyId) => {
  if (!companyId) return false;
  if (user?.company && String(user.company) === String(companyId)) return true;
  const ownedCompany = await Company.findOne({ _id: companyId, owner: userId }).select('_id');
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
  return Boolean(ownedCompany);
};

/**
 * GET /api/template-profiles/:companyId/active
 * Get active template profile for a company
 */
export const getActiveProfile = async (req, res) => {
  try {
    const auth = await getAuthContext(req);
    if (!auth) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { companyId } = req.params;
    if (!(await canAccessCompany(auth, companyId))) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const profile = await getActiveTemplateProfile(companyId);

    if (!profile) {
      return res.status(404).json({
        message: 'No active template profile found',
        data: null,
      });
    }

    res.json({
      message: 'Active template profile retrieved',
      data: profile,
    });
  } catch (err) {
    res.status(500).json({
      message: 'Failed to retrieve template profile',
      error: err.message,
    });
  }
};

/**
 * GET /api/template-profiles/:profileId
 * Get specific template profile
 */
export const getProfile = async (req, res) => {
  try {
    const auth = await getAuthContext(req);
    if (!auth) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { profileId } = req.params;
    const profile = await getTemplateProfileById(profileId);

    if (!profile) {
      return res.status(404).json({
        message: 'Template profile not found',
        data: null,
      });
    }

    if (!(await canAccessCompany(auth, profile.companyId))) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json({
      message: 'Template profile retrieved',
      data: profile,
    });
  } catch (err) {
    res.status(500).json({
      message: 'Failed to retrieve template profile',
      error: err.message,
    });
  }
};

/**
 * GET /api/template-profiles/:companyId/versions/:templateName
 * List all versions of a template
 */
export const listVersions = async (req, res) => {
  try {
    const auth = await getAuthContext(req);
    if (!auth) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { companyId, templateName } = req.params;
    if (!(await canAccessCompany(auth, companyId))) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const versions = await listTemplateVersions(companyId, templateName);

    res.json({
      message: 'Template versions retrieved',
      data: versions,
      count: versions.length,
    });
  } catch (err) {
    res.status(500).json({
      message: 'Failed to list template versions',
      error: err.message,
    });
  }
};

/**
 * POST /api/template-profiles/:companyId
 * Create new template profile
 */
export const createProfile = async (req, res) => {
  try {
    const auth = await getAuthContext(req);
    if (!auth) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { companyId } = req.params;
    if (!(await canAccessCompany(auth, companyId))) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const userId = auth.userId;

    const profile = await createTemplateProfile(companyId, req.body, userId);

    res.status(201).json({
      message: 'Template profile created',
      data: profile,
    });
  } catch (err) {
    res.status(500).json({
      message: 'Failed to create template profile',
      error: err.message,
    });
  }
};

/**
 * PATCH /api/template-profiles/:profileId
 * Update template profile (creates new version)
 */
export const updateProfile = async (req, res) => {
  try {
    const auth = await getAuthContext(req);
    if (!auth) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { profileId } = req.params;
    const existing = await getTemplateProfileById(profileId);
    if (!existing) {
      return res.status(404).json({ message: 'Template profile not found', data: null });
    }
    if (!(await canAccessCompany(auth, existing.companyId))) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const userId = auth.userId;

    const profile = await updateTemplateProfile(profileId, req.body, userId);

    res.json({
      message: 'Template profile updated (new version created)',
      data: profile,
    });
  } catch (err) {
    res.status(500).json({
      message: 'Failed to update template profile',
      error: err.message,
    });
  }
};

/**
 * POST /api/template-profiles/:profileId/activate
 * Activate a specific template profile version
 */
export const activateProfile = async (req, res) => {
  try {
    const auth = await getAuthContext(req);
    if (!auth) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { profileId } = req.params;
    const existing = await getTemplateProfileById(profileId);
    if (!existing) {
      return res.status(404).json({ message: 'Template profile not found', data: null });
    }
    if (!(await canAccessCompany(auth, existing.companyId))) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const userId = auth.userId;

    const profile = await activateTemplateProfile(profileId, userId);

    res.json({
      message: 'Template profile activated',
      data: profile,
    });
  } catch (err) {
    res.status(500).json({
      message: 'Failed to activate template profile',
      error: err.message,
    });
  }
};

/**
 * POST /api/template-profiles/:companyId/:templateName/rollback
 * Rollback to previous template version
 */
export const rollback = async (req, res) => {
  try {
    const auth = await getAuthContext(req);
    if (!auth) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { companyId, templateName } = req.params;
    if (!(await canAccessCompany(auth, companyId))) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const userId = auth.userId;

    const profile = await rollbackTemplateProfile(companyId, templateName, userId);

    res.json({
      message: 'Template profile rolled back',
      data: profile,
    });
  } catch (err) {
    res.status(500).json({
      message: 'Failed to rollback template profile',
      error: err.message,
    });
  }
};

/**
 * POST /api/template-profiles/:profileId/deprecate
 * Mark a template profile as deprecated
 */
export const deprecateProfile = async (req, res) => {
  try {
    const auth = await getAuthContext(req);
    if (!auth) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { profileId } = req.params;
    const existing = await getTemplateProfileById(profileId);
    if (!existing) {
      return res.status(404).json({ message: 'Template profile not found', data: null });
    }
    if (!(await canAccessCompany(auth, existing.companyId))) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const profile = await deprecateTemplateProfile(profileId);

    res.json({
      message: 'Template profile deprecated',
      data: profile,
    });
  } catch (err) {
    res.status(500).json({
      message: 'Failed to deprecate template profile',
      error: err.message,
    });
  }
};

/**
 * GET /api/template-profiles/:companyId/:templateName/audit
 * Get audit trail for a template
 */
export const getAuditTrail = async (req, res) => {
  try {
    const auth = await getAuthContext(req);
    if (!auth) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { companyId, templateName } = req.params;
    if (!(await canAccessCompany(auth, companyId))) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const trail = await getProfileAuditTrail(companyId, templateName);

    res.json({
      message: 'Audit trail retrieved',
      data: trail,
      count: trail.length,
    });
  } catch (err) {
    res.status(500).json({
      message: 'Failed to retrieve audit trail',
      error: err.message,
    });
  }
};

/**
 * DELETE /api/template-profiles/:profileId
 * Delete template profile
 */
export const removeProfile = async (req, res) => {
  try {
    const auth = await getAuthContext(req);
    if (!auth) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { profileId } = req.params;
    const existing = await getTemplateProfileById(profileId);
    if (!existing) {
      return res.status(404).json({ message: 'Template profile not found', data: null });
    }
    if (!(await canAccessCompany(auth, existing.companyId))) {
      return res.status(403).json({ message: 'Access denied' });
    }

    await deleteTemplateProfile(profileId);

    res.json({
      message: 'Template profile deleted',
    });
  } catch (err) {
    res.status(500).json({
      message: 'Failed to delete template profile',
      error: err.message,
    });
  }
};
