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
  },
  { timestamps: true }
);

const Chat = mongoose.model('Chat', chatMessageSchema);
export default Chat;


