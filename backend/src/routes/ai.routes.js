import express from 'express';
import authenticateToken from '../middleware/auth.middleware.js';
import { requireActiveSubscription } from '../middleware/subscription.middleware.js';
import { expensiveOperationLimiter } from '../middleware/rateLimiters.js';
import {
  extractTables,
  extractInvoiceTables,
  extractAttendanceTables,
  generateInvoice,
  getCapabilities,
  createExtractionJob,
  getExtractionJobStatus,
  getExtractionJobResult,
  getExtractionJobMetrics,
} from '../controllers/ai.controller.js';

const router = express.Router();

router.get('/capabilities', getCapabilities);
// Synchronous AI endpoints require tenant authentication to prevent arbitrary file access
router.post('/extract', authenticateToken, requireActiveSubscription, expensiveOperationLimiter, extractTables);
router.post('/extract/invoice-summary', authenticateToken, requireActiveSubscription, expensiveOperationLimiter, extractInvoiceTables);
router.post('/extract/attendance', authenticateToken, requireActiveSubscription, expensiveOperationLimiter, extractAttendanceTables);
router.post('/generate-invoice', authenticateToken, requireActiveSubscription, expensiveOperationLimiter, generateInvoice);
router.post('/jobs', authenticateToken, requireActiveSubscription, expensiveOperationLimiter, createExtractionJob);
router.get('/jobs/metrics', authenticateToken, requireActiveSubscription, getExtractionJobMetrics);
router.get('/jobs/:jobId', authenticateToken, requireActiveSubscription, getExtractionJobStatus);
router.get('/jobs/:jobId/result', authenticateToken, requireActiveSubscription, getExtractionJobResult);

export default router;


