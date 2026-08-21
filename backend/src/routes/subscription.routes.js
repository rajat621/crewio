import express from 'express';
import {
  getPlans,
  getStatus,
  createCheckout,
  createPortalSession,
} from '../controllers/subscription.controller.js';
import authenticateToken from '../middleware/auth.middleware.js';
import { moderateLimiter } from '../middleware/rateLimiters.js';

const router = express.Router();

// Public: plan catalog is safe to show to anyone (pricing page can be seen
// pre-login if ever needed).
router.get('/plans', getPlans);

// Everything else requires a logged-in user.
router.get('/status', authenticateToken, getStatus);
router.post('/checkout-session', authenticateToken, moderateLimiter, createCheckout);
router.post('/portal-session', authenticateToken, moderateLimiter, createPortalSession);

// NOTE: the Stripe webhook route (/api/subscription/webhook) is intentionally
// NOT defined here. It needs the raw request body (for signature
// verification) and must be mounted in app.js BEFORE express.json() runs.
// See app.js for `app.post('/api/subscription/webhook', express.raw(...), handleWebhook)`.

export default router;
