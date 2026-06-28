//backend/src/routes/chat.routes.js
import express from 'express';
import jwt from 'jsonwebtoken';
import authenticateToken from '../middleware/auth.middleware.js';
import authenticateEmployee from '../middleware/employeeAuth.middleware.js';
import { env } from '../config/env.js';
import {sendMessage, getMessagesForEmployee, getConversations,} from '../controllers/chat.controller.js';
const router = express.Router();

const isEmployeeToken = (token) => {
  try {
    const decoded = jwt.decode(token) || {};
    return (
      decoded.role === 'employee' ||
      Boolean(decoded.employeeId) ||
      Boolean(decoded.empId) ||
      Boolean(decoded.appUserId)
    );
  } catch (_error) {
    return false;
  }
};

const authenticateChatToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }

  if (isEmployeeToken(token)) {
    return authenticateEmployee(req, res, next);
  }

  return authenticateToken(req, res, next);
};

router.use(authenticateChatToken);

router.post('/send', sendMessage);
router.get('/conversations', getConversations);
router.get('/employee/:employeeId', getMessagesForEmployee);

export default router;
