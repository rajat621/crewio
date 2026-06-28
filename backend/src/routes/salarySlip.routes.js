import express from 'express'
import { createSalarySlip, listSalarySlips, getSalarySlip, addDeduction } from '../controllers/salarySlip.controller.js'
import authenticateToken from '../middleware/auth.middleware.js'

const router = express.Router()

router.use(authenticateToken)

router.post('/', createSalarySlip)
router.get('/', listSalarySlips)
router.get('/:id', getSalarySlip)
router.post('/:id/deductions', addDeduction)

export default router
