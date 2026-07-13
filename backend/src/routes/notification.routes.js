import express from 'express';
import authenticateToken from '../middleware/auth.middleware.js';
import authenticateEmployee from '../middleware/employeeAuth.middleware.js';
import authenticateDual from '../middleware/dualAuth.middleware.js';
import { createNotification, listNotificationsForUser, markNotificationRead, deleteAllNotifications } from '../controllers/notification.controller.js';

const router = express.Router();

router.post('/', authenticateToken, createNotification);
router.get('/', authenticateEmployee, listNotificationsForUser);
router.get('/owner', authenticateToken, listNotificationsForUser);
router.delete('/owner', authenticateToken, deleteAllNotifications);
// Both owners and employees need to be able to mark their own notifications read.
router.post('/:id/read', authenticateDual, markNotificationRead);

export default router;
