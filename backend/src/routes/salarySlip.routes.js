import express from 'express'
import { createSalarySlip, listSalarySlips, getSalarySlip, addDeduction, getMyAdvances, downloadSalarySlip } from '../controllers/salarySlip.controller.js'
import authenticateDual, { authenticateDualOrQueryToken } from '../middleware/dualAuth.middleware.js'

const router = express.Router()

// The download route is registered BEFORE the blanket authenticateDual
// below and uses its own query-token-aware auth, since this link is opened
// directly in the device's external browser (see mobile SalarySlipsPage),
// which can't attach an Authorization header. Every other route below
// still requires the header as normal.
router.get('/:id/download', authenticateDualOrQueryToken, downloadSalarySlip)

// authenticateDual routes owner/admin tokens through authenticateToken and
// employee/mobile tokens through authenticateEmployee (which, unlike the
// authenticateToken fallback, correctly rejects refresh tokens).
router.use(authenticateDual)

router.post('/', createSalarySlip)
router.get('/', listSalarySlips)
router.get('/advances', getMyAdvances)
router.get('/:id', getSalarySlip)
router.post('/:id/deductions', addDeduction)

export default router
