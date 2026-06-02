import express from 'express';
import {
	signup,
	verifyOtp,
	login,
	signin,
	resendOtp,
	googleAuthStart,
	googleAuthCallback,
	getMe,
	updateProfile,
	changePassword,
	setupTwoFactor,
	verifyTwoFactor,
	disableTwoFactor,
} from '../controllers/auth.controller.js';
import authenticateToken from '../middleware/auth.middleware.js';

const router = express.Router();

router.post('/signup', signup);
router.post('/verify-otp', verifyOtp);
router.post('/resend-otp', resendOtp);
router.post('/login', login);
router.post('/signin', signin);
router.get('/google', googleAuthStart);
router.get('/google/callback', googleAuthCallback);
router.get('/me', authenticateToken, getMe);
router.patch('/me', authenticateToken, updateProfile);
router.post('/change-password', authenticateToken, changePassword);
router.post('/2fa/setup', authenticateToken, setupTwoFactor);
router.post('/2fa/verify', authenticateToken, verifyTwoFactor);
router.post('/2fa/disable', authenticateToken, disableTwoFactor);

export default router;
