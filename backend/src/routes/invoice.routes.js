import express from 'express';
import {
	getInvoices,
	getInvoice,
	createInvoice,
	generateInvoiceRecord,
	updateInvoice,
	deleteInvoice,
	downloadInvoice,
} from '../controllers/invoice.controller.js';

const router = express.Router();

router.get('/', getInvoices);
router.get('/:id', getInvoice);
router.post('/', createInvoice);
router.post('/generate', generateInvoiceRecord);
router.put('/:id', updateInvoice);
router.delete('/:id', deleteInvoice);
router.get('/:id/download', downloadInvoice);

export default router;
