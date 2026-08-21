import express from 'express';
import { loginEmployee, refreshEmployeeToken, logoutEmployee, registerPushToken } from '../controllers/mobile/mobileAuth.controller.js';
import {
  getMyAttendance,
  getTodayAttendance,
  getMonthlySummary,
} from '../controllers/mobile/mobileAttendance.controller.js';
import {
  getAssignmentStatus,
  checkIn,
  startWork,
  stopWork,
  siteFinished,
  startLeave,
  endLeave,
} from '../controllers/mobile/mobileLifecycle.controller.js';
import {
  getSalaryHistory,
  getNetPaymentHistory,
  getAdvanceHistory,
  getDeductionHistory,
  getMyExpenseSummary,
} from '../controllers/mobile/mobilePayments.controller.js';
import {
  getMyProfile,
  updateMyProfile,
} from '../controllers/mobile/mobileProfile.controller.js';
import authenticateEmployee from '../middleware/employeeAuth.middleware.js';
import { authLimiter, moderateLimiter } from '../middleware/rateLimiters.js';
import { postEmployeeLocation } from '../controllers/location.controller.js';

const router = express.Router();

router.post('/auth/login', authLimiter, loginEmployee);
router.post('/auth/refresh', authLimiter, refreshEmployeeToken);

router.use(authenticateEmployee);

router.post('/auth/logout', logoutEmployee);
router.post('/push/register', registerPushToken);

// --- Assignment / lifecycle -------------------------------------------------
router.get('/assignment-status', getAssignmentStatus);
router.post('/attendance/check-in', moderateLimiter, checkIn);
router.post('/attendance/start-work', moderateLimiter, startWork);
router.post('/attendance/stop-work', moderateLimiter, stopWork);
router.post('/site-finished', moderateLimiter, siteFinished);
router.post('/leave/start', moderateLimiter, startLeave);
router.post('/leave/end', moderateLimiter, endLeave);

// --- Attendance history ------------------------------------------------------
router.get('/attendance', getMyAttendance);
router.get('/attendance/summary', getMonthlySummary);
router.get('/attendance/today', getTodayAttendance);

// --- Location ----------------------------------------------------------------
router.post('/location', postEmployeeLocation);

// --- Payments ------------------------------------------------------------
router.get('/salary/history', getSalaryHistory);
router.get('/salary/net-history', getNetPaymentHistory);
router.get('/advances/history', getAdvanceHistory);
router.get('/deductions/history', getDeductionHistory);
router.get('/expenses/summary', getMyExpenseSummary);

// --- Profile -------------------------------------------------------------
router.get('/profile', getMyProfile);
router.patch('/profile', updateMyProfile);

export default router;
