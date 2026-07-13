import express from 'express';
import { getDashboard, getStats } from '../controllers/dashboard.controller.js';
import authenticateToken from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(authenticateToken);

router.get('/', getDashboard);
router.get('/stats', getStats);

export default router;


