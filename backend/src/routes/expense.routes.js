import express from 'express'
import authenticateToken from '../middleware/auth.middleware.js'
import { getExpenses, addExpense } from '../controllers/expense.controller.js'

const router = express.Router()

router.use(authenticateToken)

router.get('/', getExpenses)
router.post('/', addExpense)

export default router
