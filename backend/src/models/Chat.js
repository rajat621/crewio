//backend/src/models/Chat.js
import mongoose from 'mongoose';

const chatMessageSchema = new mongoose.Schema(
  {
    from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    to: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    text: { type: String, default: '' },
    attachments: { type: [mongoose.Schema.Types.ObjectId], ref: 'FileRecord', default: [] },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },

    // --- Voice notes ----------------------------------------------------
    // `messageType` distinguishes a plain text message from a voice note.
    // For voice messages `text` stays '' and the audio itself is never
    // stored in Mongo - only the object-storage reference. `voiceDriver`
    // records which storage backend ('local' | 'r2') the key lives under,
    // exactly like FileRecord.storageDriver, so old and new messages keep
    // resolving correctly across a local->r2 cutover.
    messageType: { type: String, enum: ['text', 'voice'], default: 'text', index: true },
    voiceKey: { type: String, default: null },
    voiceDriver: { type: String, enum: ['local', 'r2', null], default: null },
    voiceMimeType: { type: String, default: null },
    // Duration in whole seconds, as reported by the recorder on send.
    duration: { type: Number, default: null },

    // --- Read status --------------------------------------------------
    // `read` is derived/denormalized for cheap unread-count queries; the
    // authoritative "when" lives in `seenAt`. A message is unread while
    // `read` is false and `seenAt` is null.
    read: { type: Boolean, default: false, index: true },
    seenAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Powers getConversations()'s per-employee grouping/sort (latest message per
// owner+counterparty) and the unread-count aggregation below.
chatMessageSchema.index({ ownerId: 1, to: 1, from: 1, read: 1 });
chatMessageSchema.index({ ownerId: 1, createdAt: -1 });

const Chat = mongoose.model('Chat', chatMessageSchema);
export default Chat;

