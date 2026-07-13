import express from 'express';
import {
	getAttendance,
	createAttendance,
	updateAttendance,
	deleteAttendance,
	getAttendanceSummary,
} from '../controllers/attendance.controller.js';
import authenticateToken from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(authenticateToken);

router.get('/', getAttendance);
router.post('/', createAttendance);
router.get('/summary', getAttendanceSummary);
router.put('/:id', updateAttendance);
router.delete('/:id', deleteAttendance);

export default router;


