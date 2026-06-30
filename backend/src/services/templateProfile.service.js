import TemplateProfile from '../models/TemplateProfile.js';

/**
 * Get the active template profile for a company
 */
export const getActiveTemplateProfile = async (companyId) => {
  const profile = await TemplateProfile.findOne({
    companyId,
    isActive: true,
  });
  return profile;
};

/**
 * Get template profile by ID
 */
export const getTemplateProfileById = async (profileId) => {
  return await TemplateProfile.findById(profileId);
};

/**
 * List all versions of a template for a company
 */
export const listTemplateVersions = async (companyId, templateName) => {
  return await TemplateProfile.find({
    companyId,
    templateName,
  }).sort({ version: -1 });
};

/**
 * Create new template profile version
 * Automatically increments version and copies from previous if exists
 */
export const createTemplateProfile = async (companyId, data, userId) => {
  const { templateName, description, ...profileData } = data;

  // Find latest version to auto-increment
  const latest = await TemplateProfile.findOne({
    companyId,
    templateName,
  }).sort({ version: -1 });

  const nextVersion = latest ? latest.version + 1 : 1;

  const profile = new TemplateProfile({
    companyId,
    templateName,
    version: nextVersion,
    description: description || `Version ${nextVersion}`,
    createdBy: userId,
    lastModifiedBy: userId,
    ...profileData,
  });

  await profile.save();
  return profile;
};

/**
 * Update template profile (creates new version)
 */
export const updateTemplateProfile = async (profileId, updates, userId) => {
  const current = await TemplateProfile.findById(profileId);
  if (!current) throw new Error('Profile not found');

  // Create a new version
  const newProfile = new TemplateProfile({
    companyId: current.companyId,
    templateName: current.templateName,
    version: current.version + 1,
    description: updates.description || `Updated from v${current.version}`,
    createdBy: userId,
    lastModifiedBy: userId,
    isActive: false, // New versions are inactive by default
    ...updates,
  });

  await newProfile.save();
  return newProfile;
};

/**
 * Activate a specific template profile version
 */
export const activateTemplateProfile = async (profileId, userId) => {
  const profile = await TemplateProfile.findById(profileId);
  if (!profile) throw new Error('Profile not found');

  // Deactivate other versions
  await TemplateProfile.updateMany(
    { companyId: profile.companyId, templateName: profile.templateName },
    { isActive: false }
  );

  // Activate this one
  profile.isActive = true;
  profile.approvedBy = userId;
  profile.approvalDate = new Date();
  profile.validationStatus = 'validated';
  await profile.save();

  return profile;
};

/**
 * Rollback to previous template version
 */
export const rollbackTemplateProfile = async (companyId, templateName, userId) => {
  const versions = await TemplateProfile.find({
    companyId,
    templateName,
  }).sort({ version: -1 });

  if (versions.length < 2) {
    throw new Error('No previous version to rollback to');
  }

  const previousVersion = versions[1];
  await activateTemplateProfile(previousVersion._id, userId);
  return previousVersion;
};

/**
 * Deprecate a template profile
 */
export const deprecateTemplateProfile = async (profileId) => {
  const profile = await TemplateProfile.findById(profileId);
  if (!profile) throw new Error('Profile not found');

  profile.validationStatus = 'deprecated';
  profile.isActive = false;
  await profile.save();
  return profile;
};

/**
 * Get profile revision history for audit
 */
export const getProfileAuditTrail = async (companyId, templateName) => {
  return await TemplateProfile.find({
    companyId,
    templateName,
  })
    .populate('createdBy', 'name email')
    .populate('lastModifiedBy', 'name email')
    .populate('approvedBy', 'name email')
    .sort({ version: -1 });
};

/**
 * Delete template profile by id
 */
export const deleteTemplateProfile = async (profileId) => {
  const deleted = await TemplateProfile.findByIdAndDelete(profileId);
  if (!deleted) throw new Error('Profile not found');
  return deleted;
};
