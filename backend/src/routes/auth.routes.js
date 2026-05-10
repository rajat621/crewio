import express from 'express';
import {
	signup,
	verifyOtp,
	login,
	signin,
	resendOtp,
	getMe,
	updateProfile,
	changePassword,
	setupTwoFactor,
	verifyTwoFactor,
	disableTwoFactor,
} from '../controllers/auth.controller.js';
import authenticateToken from '../middleware/auth.middleware.js';
import { env } from '../config/env.js';

const router = express.Router();

router.post('/signup', signup);
router.post('/verify-otp', verifyOtp);
router.post('/resend-otp', resendOtp);
router.post('/login', login);
router.post('/signin', signin);
router.get('/google', (req, res) => {
  const origin = req.headers.origin || req.headers.referer?.split('/').slice(0, 3).join('/');
  const targetBase = origin || env.FRONTEND_URL || 'http://localhost:5173';
  const target = `${targetBase}/signin?oauth=not-configured`;
	return res.redirect(target);
});
router.get('/me', authenticateToken, getMe);
router.patch('/me', authenticateToken, updateProfile);
router.post('/change-password', authenticateToken, changePassword);
router.post('/2fa/setup', authenticateToken, setupTwoFactor);
router.post('/2fa/verify', authenticateToken, verifyTwoFactor);
router.post('/2fa/disable', authenticateToken, disableTwoFactor);

export default router;
