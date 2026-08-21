import express from 'express'
import authenticateToken from '../middleware/auth.middleware.js'
import { requireActiveSubscription } from '../middleware/subscription.middleware.js';
import {
  listCompanyExpenses,
  createCompanyExpense,
  updateCompanyExpense,
  deleteCompanyExpense,
} from '../controllers/companyExpense.controller.js'

const router = express.Router()

router.use(authenticateToken)
router.use(requireActiveSubscription);

router.get('/', listCompanyExpenses)
router.post('/', createCompanyExpense)
router.put('/:id', updateCompanyExpense)
router.delete('/:id', deleteCompanyExpense)

export default router