//backend/src/controllers/chat.controller.js
import Chat from '../models/Chat.js';
import { serverError } from '../utils/apiResponse.js';
import Employee from '../models/Employee.js';
import Notification from '../models/Notification.js';
import { sendPushToEmployee } from '../services/push.service.js';
import { emitToDashboard, emitToEmployee } from '../services/socket.service.js';
import { saveBuffer, streamObject, driverFromStoredPath, deleteObject } from '../services/storage.service.js';
import mongoose from 'mongoose';

// Voice notes: compressed formats only - never WAV. The Flutter app always
// records m4a/AAC (see voice_recorder_service.dart). Browser dashboards are
// also a valid sender (owner replying with a voice note): Chrome/Firefox's
// MediaRecorder can only natively produce webm/opus (Safari can do mp4/aac),
// so that's accepted too - it's just as compressed as AAC, just a different
// container/codec, and is never raw PCM/WAV.
export const VOICE_ALLOWED_MIME_TYPES = new Set([
  'audio/m4a',
  'audio/x-m4a',
  'audio/aac',
  'audio/mp4',
  'audio/mp4a-latm',
  'audio/webm',
  'audio/webm;codecs=opus',
  'audio/ogg',
]);
export const VOICE_MAX_BYTES = 8 * 1024 * 1024; // 8 MB - comfortably above a few minutes of AAC
export const VOICE_MAX_DURATION_SECONDS = 300; // 5 minutes - this is a business chat, not a voicemail archive

// Shared by sendMessage/sendVoiceMessage: resolves who is sending, which
// owner/tenant they belong to, and who the message is going to. Never
// trusts a client-supplied ownerId - it's always taken from the verified
// JWT (req.user / req.employee), which is what actually prevents one
// company from ever messaging another company's employee.
const resolveSenderAndRecipient = async (req) => {
  let from = null;
  let ownerId = null;
  let isEmployeeSender = false;

  if (req.user && req.user.userId) {
    from = req.user.userId;
    ownerId = req.user.ownerId || null;
  } else if (req.employee && req.employee._id) {
    from = req.employee._id;
    ownerId = req.employee.ownerId || null;
    isEmployeeSender = true;
  } else {
    return { error: { status: 401, message: 'Not authenticated' } };
  }

  if (!ownerId) {
    return { error: { status: 400, message: 'No office/owner is linked to this account yet' } };
  }

  const toEmployeeId = (req.body || {}).toEmployeeId;
  let to;
  let toEmp = null;

  if (isEmployeeSender && !toEmployeeId) {
    // Employee sending from the mobile app with no explicit recipient -
    // this always means "message my office/owner".
    to = ownerId;
  } else {
    if (!toEmployeeId) return { error: { status: 400, message: 'toEmployeeId required' } };
    // .select('_id') - every toEmp.<field> reference across this function
    // and broadcastAndNotify() below uses only ._id (verified via grep of
    // every `toEmp.` occurrence in this file).
    toEmp = await Employee.findOne({ _id: toEmployeeId, ownerId }).select('_id');
    if (!toEmp) return { error: { status: 404, message: 'Recipient employee not found' } };
    to = toEmp._id;
  }

  return { from, ownerId, isEmployeeSender, to, toEmp };
};

// Emits the realtime event + persists/pushes the recipient notification for
// a just-created Chat doc. Shared by text and voice sends so the two paths
// can never fall out of sync on what "a new message arrived" means.
const broadcastAndNotify = async ({ chat, from, ownerId, to, toEmp, isEmployeeSender, notifBody, req }) => {
  try {
    const chatPayload = {
      _id: String(chat._id),
      from: String(from),
      to: String(to),
      text: chat.text,
      messageType: chat.messageType,
      voiceUrl: chat.messageType === 'voice' ? `/api/chat/voice/${chat._id}` : null,
      duration: chat.duration ?? null,
      createdAt: chat.createdAt,
      ownerId: String(ownerId),
      read: false,
    };
    emitToDashboard(ownerId, 'chat:message', chatPayload);
    if (toEmp) emitToEmployee(toEmp._id, 'chat:message', chatPayload);
  } catch (err) {
    // A socket failure must never break message sending itself - the
    // client still gets the message back in the HTTP response below and
    // will pick it up on next poll/open.
    console.error('[chat] Failed to emit chat:message', err.message);
  }

  try {
    if (toEmp) {
      const notifTitle = isEmployeeSender ? 'New message' : 'New message from your office';
      const notifPayload = { type: 'chat_message', fromId: String(from) };
      await sendPushToEmployee(toEmp, { title: notifTitle, body: notifBody, data: notifPayload });
      await Notification.create({
        user: toEmp._id,
        title: notifTitle,
        body: notifBody,
        payload: notifPayload,
        ownerId,
      });
    }
    // No dashboard bell notification when an employee messages the office -
    // the dashboard bell is scoped to check-in events only, and the chat
    // UI's own unread badge (FloatingChatButton/ChatList) already surfaces
    // this in real time via the chat:message socket event above.
  } catch (err) {
    // A notification failure must never break message sending itself.
    console.error('[chat] Failed to notify recipient of new message', err.message);
  }
};

export const sendMessage = async (req, res) => {
  try {
    const payload = req.body || {};
    const resolved = await resolveSenderAndRecipient(req);
    if (resolved.error) return res.status(resolved.error.status).json({ message: resolved.error.message });
    const { from, ownerId, isEmployeeSender, to, toEmp } = resolved;

    const text = (payload.text || '').trim();
    if (!text) return res.status(400).json({ message: 'text required' });

    const chat = await Chat.create({ from, to, text, ownerId, messageType: 'text' });

    await broadcastAndNotify({
      chat,
      from,
      ownerId,
      to,
      toEmp,
      isEmployeeSender,
      notifBody: text,
      req,
    });

    return res.json({ message: 'Message sent', data: chat });
  } catch (error) {
    return serverError(res, 'Failed to send message');
  }
};

// POST /api/chat/send-voice (multipart/form-data, field "file") - records a
// voice note. The audio itself is uploaded straight to R2/local storage via
// storage.service.js and never touches MongoDB; only the storage key,
// mime type and reported duration are persisted on the Chat doc.
export const sendVoiceMessage = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No audio file uploaded' });

    const resolved = await resolveSenderAndRecipient(req);
    if (resolved.error) return res.status(resolved.error.status).json({ message: resolved.error.message });
    const { from, ownerId, isEmployeeSender, to, toEmp } = resolved;

    const duration = Number((req.body || {}).duration);
    if (!Number.isFinite(duration) || duration <= 0 || duration > VOICE_MAX_DURATION_SECONDS) {
      return res.status(400).json({
        message: `Invalid voice note duration (must be between 0 and ${VOICE_MAX_DURATION_SECONDS} seconds)`,
      });
    }

    const companyId = req.user?.companyId || req.employee?.company || null;
    const ext = req.file.mimetype === 'audio/aac' ? 'aac' : 'm4a';
    const saved = await saveBuffer({
      companyId,
      ownerId,
      folder: 'chat-voice',
      filename: `${Date.now()}-${String(from)}.${ext}`,
      buffer: req.file.buffer,
      mimetype: req.file.mimetype,
    });

    let chat;
    try {
      chat = await Chat.create({
        from,
        to,
        text: '',
        ownerId,
        messageType: 'voice',
        voiceKey: saved.key,
        voiceDriver: saved.driver,
        voiceMimeType: req.file.mimetype,
        duration: Math.round(duration),
      });
    } catch (createError) {
      // Best-effort cleanup so a Chat-record failure doesn't leave the
      // just-uploaded voice note orphaned in storage indefinitely - same
      // pattern as the upload.controller.js fix. A cleanup failure here
      // must never mask the original, more actionable error below.
      try {
        await deleteObject({ key: saved.key, driver: saved.driver });
      } catch (cleanupError) {
        console.error('Failed to clean up orphaned voice note after Chat creation failure:', cleanupError.message);
      }
      throw createError;
    }

    await broadcastAndNotify({
      chat,
      from,
      ownerId,
      to,
      toEmp,
      isEmployeeSender,
      notifBody: 'Sent a voice note',
      req,
    });

    return res.json({
      message: 'Voice message sent',
      data: { ...chat.toObject(), voiceUrl: `/api/chat/voice/${chat._id}` },
    });
  } catch (error) {
    return serverError(res, 'Failed to send voice message');
  }
};

// GET /api/chat/voice/:messageId - streams the audio for a voice note.
// Access is scoped to the message itself: only the two participants (or an
// owner/admin from the same company) may ever fetch it - never trusts a
// company/owner id from the request, only from the verified token.
export const getVoiceMessage = async (req, res) => {
  try {
    const ownerId = req.user?.ownerId || req.employee?.ownerId;
    if (!ownerId) return res.status(401).json({ message: 'Not authenticated' });

    const chat = await Chat.findOne({ _id: req.params.messageId, ownerId, messageType: 'voice' });
    if (!chat || !chat.voiceKey) return res.status(404).json({ message: 'Voice message not found' });

    const viewerId = req.employee?._id ? String(req.employee._id) : String(req.user.userId);
    const isParticipant = String(chat.from) === viewerId || String(chat.to) === viewerId;
    // A dashboard/owner user who isn't a direct participant may still be
    // the office side of the thread (ownerId already scopes this to their
    // own company); an employee must always be from/to on the message.
    if (!isParticipant && req.employee) {
      return res.status(403).json({ message: 'Access denied to this voice message' });
    }

    const driver = chat.voiceDriver || driverFromStoredPath(chat.voiceKey);
    await streamObject({
      key: chat.voiceKey,
      driver,
      res,
      contentType: chat.voiceMimeType || 'audio/mp4',
      disposition: 'inline; filename="voice-note"',
    });
  } catch (error) {
    if (!res.headersSent) {
      return serverError(res, 'Failed to load voice message');
    }
  }
};

export const getMessagesForEmployee = async (req, res) => {
  try {
    const ownerId =
      req.user?.ownerId ||
      req.employee?.ownerId;

    if (!ownerId) {
      return res.status(401).json({
        message: 'User not authenticated'
      });
    }

    // Employees may only ever read their own thread - never trust the URL param
    // for an employee-authenticated request.
    const employeeId = req.employee?._id ? String(req.employee._id) : req.params.employeeId;

    const items = await Chat.find({
      $or: [
        { from: employeeId },
        { to: employeeId }
      ],
      ownerId
    })
      .sort({ createdAt: -1 })
      .limit(100);

    // Internal storage keys (voiceKey/voiceDriver) never leave the server -
    // only a stable, access-controlled playback URL does. Everything else
    // on the doc is passed through unchanged for backward compatibility.
    const data = items.map((item) => {
      const obj = item.toObject();
      if (obj.messageType === 'voice' && obj.voiceKey) {
        obj.voiceUrl = `/api/chat/voice/${obj._id}`;
      }
      delete obj.voiceKey;
      delete obj.voiceDriver;
      return obj;
    });

    return res.json({
      message: 'Messages retrieved',
      data,
    });

  } catch (error) {
    return serverError(res, 'Failed to fetch messages');
  }
};

export const getConversations = async (req, res) => {
  try {
    const ownerId =
      req.user?.ownerId ||
      req.employee?.ownerId;

    if (!ownerId) {
      return res.status(401).json({
        message: "User not authenticated",
      });
    }

    // The dashboard viewer's own id - used both to figure out "who's the
    // other side of this thread" and to count messages addressed to *them*
    // as unread.
    const viewerId = req.user?.userId || req.employee?._id;

    const conversations = await Chat.aggregate([
      {
        $match: {
          ownerId: new mongoose.Types.ObjectId(ownerId),
        },
      },
      {
        $addFields: {
          employeeId: {
            $cond: [
              { $eq: ["$from", new mongoose.Types.ObjectId(viewerId)] },
              "$to",
              "$from",
            ],
          },
        },
      },
      {
        $sort: {
          createdAt: -1,
        },
      },
      {
        $group: {
          _id: "$employeeId",
          lastMessage: {
            $first: "$text",
          },
          lastMessageType: {
            $first: "$messageType",
          },
          lastMessageTime: {
            $first: "$createdAt",
          },
          unreadCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$to", new mongoose.Types.ObjectId(viewerId)] },
                    { $eq: ["$read", false] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]);
    const employeeIds = conversations.map((c) => c._id);

    const employees = await Employee.find({
      _id: { $in: employeeIds },
    }).select('_id name profileImage trade');

    const employeeMap = {};

    employees.forEach((emp) => {
      employeeMap[String(emp._id)] = emp;
    });

    const result = conversations
      .map((chat) => {
        const emp = employeeMap[String(chat._id)];

        if (!emp) return null;

        // A voice note's `text` is always '' - without this, the preview
        // would silently show "No messages yet" even though there's an
        // unread voice note waiting.
        const lastMessage = chat.lastMessageType === 'voice' ? 'Voice message' : chat.lastMessage;

        return {
          employeeId: emp._id,
          employeeName: emp.name,
          employeePhoto: emp.profileImage || null,
          trade: emp.trade,
          lastMessage,
          lastMessageTime: chat.lastMessageTime,
          lastMessageTimestamp: chat.lastMessageTime,
          unreadCount: chat.unreadCount || 0,
          readStatus: chat.unreadCount > 0 ? "unread" : "read",
        };
      })
      .filter(Boolean)
      // Slack/WhatsApp-style ordering: unread threads first, then by most
      // recent message, with the rest naturally trailing by timestamp.
      .sort((a, b) => {
        const aUnread = a.unreadCount > 0 ? 1 : 0;
        const bUnread = b.unreadCount > 0 ? 1 : 0;
        if (aUnread !== bUnread) return bUnread - aUnread;
        return new Date(b.lastMessageTime || 0) - new Date(a.lastMessageTime || 0);
      });

    return res.json({
      message: "Conversation list",
      data: result,
    });
  } catch (error) {
    return serverError(res, 'Failed to fetch conversations');
  }
};

// POST /api/chat/read/:employeeId - marks every message from that
// counterparty to the current viewer as read, in one indexed bulk update.
// Called when a conversation is opened on the dashboard (or, symmetrically,
// when an employee opens their thread with the office).
export const markConversationRead = async (req, res) => {
  try {
    const ownerId = req.user?.ownerId || req.employee?.ownerId;
    if (!ownerId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const viewerId = req.user?.userId || req.employee?._id;
    // Employees only ever have one thread (with the office/owner); dashboard
    // users specify which employee's thread they're reading.
    const counterpartyId = req.employee?._id ? ownerId : req.params.employeeId;

    if (!counterpartyId) {
      return res.status(400).json({ message: 'employeeId required' });
    }

    const seenAt = new Date();
    const result = await Chat.updateMany(
      { ownerId, from: counterpartyId, to: viewerId, read: false },
      { $set: { read: true, seenAt } }
    );

    // Real-time: clear the badge instantly on every connected session for
    // this owner (multiple dashboard tabs), and let the sender's device
    // know their message was seen.
    try {
      emitToDashboard(ownerId, 'chat:read', {
        employeeId: String(counterpartyId),
        readerId: String(viewerId),
        seenAt,
      });
      if (req.user) {
        emitToEmployee(counterpartyId, 'chat:read', { readerId: String(viewerId), seenAt });
      }
    } catch (err) {
      console.error('[chat] Failed to emit chat:read', err.message);
    }

    return res.json({
      message: 'Conversation marked as read',
      data: { modifiedCount: result.modifiedCount ?? result.nModified ?? 0, seenAt },
    });
  } catch (error) {
    return serverError(res, 'Failed to mark conversation as read');
  }
};

export default {
  sendMessage,
  sendVoiceMessage,
  getVoiceMessage,
  getMessagesForEmployee,
  getConversations,
  markConversationRead,
};