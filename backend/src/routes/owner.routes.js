import express from 'express';
import authenticateToken from '../middleware/auth.middleware.js';
import {
  getEmployeeLocations,
  getLatestEmployeeLocation,
  requestCurrentLocation,
} from '../controllers/location.controller.js';

const router = express.Router();
router.use(authenticateToken);

router.get('/locations', getEmployeeLocations);
router.get('/locations/latest', getLatestEmployeeLocation);
router.post('/locations/request', requestCurrentLocation);

export default router;


