import express from 'express';
import authenticateToken from '../middleware/auth.middleware.js';
import { requireActiveSubscription } from '../middleware/subscription.middleware.js';
import {
  createInvoiceDraft,
  getInvoiceDraft,
  updateInvoiceDraft,
  approveInvoiceDraft,
  discardInvoiceDraft,
  getDraftSourceFile,
} from '../controllers/invoiceDraft.controller.js';

const router = express.Router();

router.use(authenticateToken);
router.use(requireActiveSubscription);

router.post('/', createInvoiceDraft);
router.get('/:id', getInvoiceDraft);
router.get('/:id/source', getDraftSourceFile);
router.patch('/:id', updateInvoiceDraft);
router.post('/:id/approve', approveInvoiceDraft);
router.delete('/:id', discardInvoiceDraft);

export default router;