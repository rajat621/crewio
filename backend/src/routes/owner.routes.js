import express from 'express';
import authenticateToken from '../middleware/auth.middleware.js';
import { getEmployeeLocations } from '../controllers/location.controller.js';

const router = express.Router();
router.use(authenticateToken);

router.get('/locations', getEmployeeLocations);

export default router;
