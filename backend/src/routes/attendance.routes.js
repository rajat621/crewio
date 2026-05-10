import express from 'express';
import {
	getAttendance,
	createAttendance,
	updateAttendance,
	getAttendanceSummary,
} from '../controllers/attendance.controller.js';

const router = express.Router();

router.get('/', getAttendance);
router.post('/', createAttendance);
router.put('/:id', updateAttendance);
router.get('/summary', getAttendanceSummary);

export default router;
