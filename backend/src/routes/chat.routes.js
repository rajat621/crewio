//backend/src/routes/chat.routes.js
import express from 'express';
import authenticateDual from '../middleware/dualAuth.middleware.js';
import { sendMessage, getMessagesForEmployee, getConversations } from '../controllers/chat.controller.js';

const router = express.Router();

router.use(authenticateDual);

router.post('/send', sendMessage);
router.get('/conversations', getConversations);
router.get('/employee/:employeeId', getMessagesForEmployee);

// Mobile-friendly alias: employees don't need to know their own ObjectId,
// this always resolves to "my thread with the office".
router.get('/thread', getMessagesForEmployee);

export default router;
