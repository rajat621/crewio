import express from 'express';
import { getDashboard, getStats, getDashboardSummary, getFinanceSummary } from '../controllers/dashboard.controller.js';
import authenticateToken from '../middleware/auth.middleware.js';
import { requireActiveSubscription } from '../middleware/subscription.middleware.js';

const router = express.Router();

router.use(authenticateToken);
router.use(requireActiveSubscription);

router.get('/', getDashboard);
router.get('/stats', getStats);
router.get('/summary', getDashboardSummary);
router.get('/finance-summary', getFinanceSummary);

export default router;


