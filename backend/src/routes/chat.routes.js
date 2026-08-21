//backend/src/routes/chat.routes.js
import express from 'express';
import multer from 'multer';
import authenticateDual, { authenticateDualOrQueryToken } from '../middleware/dualAuth.middleware.js';
import {
  sendMessage,
  sendVoiceMessage,
  getVoiceMessage,
  getMessagesForEmployee,
  getConversations,
  markConversationRead,
  VOICE_ALLOWED_MIME_TYPES,
  VOICE_MAX_BYTES,
} from '../controllers/chat.controller.js';

const router = express.Router();

// Voice notes are held in memory only long enough to be handed to
// storage.service.js (identical pattern to upload.routes.js) - nothing is
// ever written to local disk here, and only m4a/AAC is accepted (never
// WAV, which would blow past VOICE_MAX_BYTES for a few seconds of audio).
const voiceStorage = multer.memoryStorage();
const voiceUpload = multer({
  storage: voiceStorage,
  limits: { fileSize: VOICE_MAX_BYTES },
  fileFilter: (req, file, cb) => {
    if (!VOICE_ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(new Error('Unsupported audio format. Only m4a/AAC voice notes are allowed.'));
    }
    cb(null, true);
  },
});

const handleVoiceUpload = (req, res, next) => {
  voiceUpload.single('file')(req, res, (err) => {
    if (err) {
      const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      return res.status(status).json({ message: err.message || 'Voice upload failed' });
    }
    next();
  });
};

// Voice playback needs to accept ?token= (native <audio>/audio players
// can't attach an Authorization header), so it must be registered - with
// its own, more permissive auth - BEFORE the blanket authenticateDual
// below, which would otherwise intercept it first and reject any request
// with no Authorization header before authenticateDualOrQueryToken ever ran.
router.get('/voice/:messageId', authenticateDualOrQueryToken, getVoiceMessage);

router.use(authenticateDual);

router.post('/send', sendMessage);
router.post('/send-voice', handleVoiceUpload, sendVoiceMessage);
router.get('/conversations', getConversations);
router.get('/employee/:employeeId', getMessagesForEmployee);
router.post('/read/:employeeId', markConversationRead);

// Mobile-friendly alias: employees don't need to know their own ObjectId,
// this always resolves to "my thread with the office".
router.get('/thread', getMessagesForEmployee);
router.post('/thread/read', markConversationRead);

export default router;
