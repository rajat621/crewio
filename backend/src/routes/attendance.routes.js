import express from 'express';
import {
	getAttendance,
	createAttendance,
	updateAttendance,
	deleteAttendance,
	getAttendanceSummary,
	getAttendanceDailyCounts,
	getAttendanceRecordedDates,
} from '../controllers/attendance.controller.js';
import authenticateToken from '../middleware/auth.middleware.js';
import { requireActiveSubscription } from '../middleware/subscription.middleware.js';

const router = express.Router();

router.use(authenticateToken);
router.use(requireActiveSubscription);

router.get('/', getAttendance);
router.post('/', createAttendance);
router.get('/summary', getAttendanceSummary);
router.get('/daily-counts', getAttendanceDailyCounts);
router.get('/recorded-dates', getAttendanceRecordedDates);
router.put('/:id', updateAttendance);
router.delete('/:id', deleteAttendance);

export default router;


