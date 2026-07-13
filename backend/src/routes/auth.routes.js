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
	deleteAccount,
} from '../controllers/auth.controller.js';
import authenticateToken from '../middleware/auth.middleware.js';
import { authLimiter, moderateLimiter } from '../middleware/rateLimiters.js';

const router = express.Router();

// authLimiter only counts failed attempts (skipSuccessfulRequests), so a
// legitimate user isn't punished for wrong-password-then-right-password.
router.post('/signup', authLimiter, signup);
router.post('/verify-otp', authLimiter, verifyOtp);
router.post('/resend-otp', moderateLimiter, resendOtp);
router.post('/login', authLimiter, login);
router.post('/signin', authLimiter, signin);
router.get('/google', googleAuthStart);
router.get('/google/callback', googleAuthCallback);
router.get('/me', authenticateToken, getMe);
router.patch('/me', authenticateToken, updateProfile);
router.post('/change-password', authenticateToken, authLimiter, changePassword);
router.post('/2fa/setup', authenticateToken, setupTwoFactor);
router.post('/2fa/verify', authenticateToken, authLimiter, verifyTwoFactor);
router.post('/2fa/disable', authenticateToken, disableTwoFactor);
router.delete('/me', authenticateToken, authLimiter, deleteAccount);

export default router;
