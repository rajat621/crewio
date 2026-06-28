<<<<<<< HEAD
﻿import express from 'express';
=======
import express from 'express';
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
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
<<<<<<< HEAD
import { postEmployeeLocation } from '../controllers/location.controller.js';
=======
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0

const router = express.Router();

router.post('/auth/login', loginEmployee);

router.use(authenticateEmployee);

router.get('/attendance', getMyAttendance);
router.post('/attendance/check-in', checkIn);
router.post('/attendance/check-out', checkOut);
<<<<<<< HEAD
router.post('/location', postEmployeeLocation);
=======
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
router.get('/attendance/today', getTodayAttendance);

router.get('/profile', getMyProfile);
router.patch('/profile', updateMyProfile);

export default router;
