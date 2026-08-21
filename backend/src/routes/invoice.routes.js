import express from 'express';
import {
	getInvoices,
	getInvoice,
	createInvoice,
	generateInvoiceRecord,
	extractInvoiceDraft,
	getNextInvoiceNumberPreview,
	updateInvoice,
	deleteInvoice,
	downloadInvoice,
} from '../controllers/invoice.controller.js';
import authenticateToken from '../middleware/auth.middleware.js';
import { requireActiveSubscription } from '../middleware/subscription.middleware.js';
import { expensiveOperationLimiter } from '../middleware/rateLimiters.js';

const router = express.Router();

router.use(authenticateToken);
router.use(requireActiveSubscription);

router.get('/', getInvoices);
router.get('/next-number', getNextInvoiceNumberPreview);
router.get('/:id', getInvoice);
// Same limiter ai.routes.js applies to its AI-extraction endpoints - this
// one is equally AI-backed (calls the AI service to extract a draft) and
// was previously riding only the generous global apiLimiter.
router.post('/extract', expensiveOperationLimiter, extractInvoiceDraft);
router.post('/', createInvoice);
router.post('/generate', generateInvoiceRecord);
router.put('/:id', updateInvoice);
router.delete('/:id', deleteInvoice);
router.get('/:id/download', expensiveOperationLimiter, downloadInvoice);

export default router;


