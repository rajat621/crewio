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
<<<<<<< HEAD
=======
router.put('/:id', updateAttendance);
router.delete('/:id', deleteAttendance);
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
router.get('/summary', getAttendanceSummary);
router.put('/:id', updateAttendance);
router.delete('/:id', deleteAttendance);

export default router;
