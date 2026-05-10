import express from 'express';
import { getDashboard, getStats } from '../controllers/dashboard.controller.js';

const router = express.Router();

router.get('/', getDashboard);
router.get('/stats', getStats);

export default router;
