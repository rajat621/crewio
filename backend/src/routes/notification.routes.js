import express from 'express';
import authenticateToken from '../middleware/auth.middleware.js';
import authenticateEmployee from '../middleware/employeeAuth.middleware.js';
import { createNotification, listNotificationsForUser, markNotificationRead } from '../controllers/notification.controller.js';

const router = express.Router();

router.post('/', authenticateToken, createNotification);
router.get('/', authenticateEmployee, listNotificationsForUser);
router.get('/owner', authenticateToken, listNotificationsForUser);
router.post('/:id/read', authenticateToken, markNotificationRead);

export default router;
