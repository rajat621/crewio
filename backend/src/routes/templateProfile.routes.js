import express from 'express';
import {
  getActiveProfile,
  getProfile,
  listVersions,
  createProfile,
  updateProfile,
  activateProfile,
  rollback,
  deprecateProfile,
  getAuditTrail,
  removeProfile,
} from '../controllers/templateProfile.controller.js';
import authenticateToken from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(authenticateToken);

// Get active template profile
router.get('/:companyId/active', getActiveProfile);

// Get specific profile
router.get('/:profileId', getProfile);

// List all versions
router.get('/:companyId/versions/:templateName', listVersions);

// Create new profile
router.post('/:companyId', createProfile);

// Update profile (creates new version)
router.patch('/:profileId', updateProfile);

// Activate profile
router.post('/:profileId/activate', activateProfile);

// Rollback
router.post('/:companyId/:templateName/rollback', rollback);

// Deprecate
router.post('/:profileId/deprecate', deprecateProfile);

// Delete
router.delete('/:profileId', removeProfile);

// Audit trail
router.get('/:companyId/:templateName/audit', getAuditTrail);

export default router;


