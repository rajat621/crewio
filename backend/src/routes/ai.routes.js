import express from 'express';
import {
  extractTables,
  extractInvoiceTables,
  extractAttendanceTables,
  generateInvoice,
  getCapabilities,
} from '../controllers/ai.controller.js';

const router = express.Router();

router.get('/capabilities', getCapabilities);
router.post('/extract', extractTables);
router.post('/extract/invoice-summary', extractInvoiceTables);
router.post('/extract/attendance', extractAttendanceTables);
router.post('/generate-invoice', generateInvoice);

export default router;
