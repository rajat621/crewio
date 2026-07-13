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

const router = express.Router();

router.use(authenticateToken);

router.get('/', getInvoices);
router.get('/next-number', getNextInvoiceNumberPreview);
router.get('/:id', getInvoice);
router.post('/extract', extractInvoiceDraft);
router.post('/', createInvoice);
router.post('/generate', generateInvoiceRecord);
router.put('/:id', updateInvoice);
router.delete('/:id', deleteInvoice);
router.get('/:id/download', downloadInvoice);

export default router;


