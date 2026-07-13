import express from 'express';
import authenticateToken from '../middleware/auth.middleware.js';
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
router.post('/extract', authenticateToken, extractTables);
router.post('/extract/invoice-summary', authenticateToken, extractInvoiceTables);
router.post('/extract/attendance', authenticateToken, extractAttendanceTables);
router.post('/generate-invoice', authenticateToken, generateInvoice);
router.post('/jobs', authenticateToken, createExtractionJob);
router.get('/jobs/metrics', authenticateToken, getExtractionJobMetrics);
router.get('/jobs/:jobId', authenticateToken, getExtractionJobStatus);
router.get('/jobs/:jobId/result', authenticateToken, getExtractionJobResult);

export default router;


