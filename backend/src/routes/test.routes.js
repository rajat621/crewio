import express from 'express';
import { sendTestPush } from '../controllers/test.controller.js';
import authenticateToken from '../middleware/auth.middleware.js';
import ensureAdmin from '../middleware/ensureAdmin.middleware.js';

const router = express.Router();

// POST /api/test/fcm - admin only
router.post('/fcm', authenticateToken, ensureAdmin, sendTestPush);

export default router;
