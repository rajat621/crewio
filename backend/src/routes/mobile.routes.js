import express from 'express';
import { loginEmployee } from '../controllers/mobile/mobileAuth.controller.js';
import {
  getMyAttendance,
  checkIn,
  checkOut,
  getTodayAttendance,
} from '../controllers/mobile/mobileAttendance.controller.js';
import {
  getMyProfile,
  updateMyProfile,
} from '../controllers/mobile/mobileProfile.controller.js';
import authenticateEmployee from '../middleware/employeeAuth.middleware.js';

const router = express.Router();

router.post('/auth/login', loginEmployee);

router.use(authenticateEmployee);

router.get('/attendance', getMyAttendance);
router.post('/attendance/check-in', checkIn);
router.post('/attendance/check-out', checkOut);
router.get('/attendance/today', getTodayAttendance);

router.get('/profile', getMyProfile);
router.patch('/profile', updateMyProfile);

export default router;
