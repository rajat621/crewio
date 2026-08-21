// backend/src/routes/legal.routes.js
import express from 'express';
import { listDocuments, getDocument, getStatus, acceptLegal } from '../controllers/legal.controller.js';
import authenticateToken from '../middleware/auth.middleware.js';
import { moderateLimiter } from '../middleware/rateLimiters.js';

const router = express.Router();

// Public - the signup screen needs to link out to full document content
// before the user has an account/token.
router.get('/documents', listDocuments);
router.get('/documents/:slug', getDocument);

// Authenticated - status/accept drive the post-login re-consent gate.
router.get('/status', authenticateToken, getStatus);
router.post('/accept', authenticateToken, moderateLimiter, acceptLegal);

export default router;
