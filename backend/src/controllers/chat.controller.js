//backend/src/controllers/chat.controller.js
import Chat from '../models/Chat.js';
import Employee from '../models/Employee.js';
import mongoose from 'mongoose';
export const sendMessage = async (req, res) => {
  try {
    const payload = req.body || {};
    // Determine sender
    let from = null;
    let ownerId = null;
    if (req.user && req.user.userId) {
      from = req.user.userId;
      ownerId = req.user.ownerId || null;
    } else if (req.employee && req.employee._id) {
      from = req.employee._id;
      ownerId = req.employee.ownerId || null;
    } else {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const toEmployeeId = payload.toEmployeeId;
    if (!toEmployeeId) return res.status(400).json({ message: 'toEmployeeId required' });

    const toEmp = await Employee.findOne({ _id: toEmployeeId, ownerId });
    if (!toEmp) return res.status(404).json({ message: 'Recipient employee not found' });

    const chat = await Chat.create({ from, to: toEmp._id, text: payload.text || '', ownerId });
    return res.json({ message: 'Message sent', data: chat });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to send message', error: error.message });
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

    const employeeId = req.params.employeeId;

    const items = await Chat.find({
      $or: [
        { from: employeeId },
        { to: employeeId }
      ],
      ownerId
    })
      .sort({ createdAt: -1 })
      .limit(100);

    return res.json({
      message: 'Messages retrieved',
      data: items,
    });

  } catch (error) {
    return res.status(500).json({
      message: 'Failed to fetch messages',
      error: error.message
    });
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
          { $eq: ["$from", new mongoose.Types.ObjectId(req.user?.userId)] },
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
      lastMessageTime: {
        $first: "$createdAt",
      },
    },
  },
]);
    const employeeIds = conversations.map((c) => c._id);

    const employees = await Employee.find({
      _id: { $in: employeeIds },
    });

    const employeeMap = {};

    employees.forEach((emp) => {
      employeeMap[String(emp._id)] = emp;
    });

    const result = conversations
      .map((chat) => {
        const emp = employeeMap[String(chat._id)];

        if (!emp) return null;

        return {
          employeeId: emp._id,
          employeeName: emp.name,
          employeePhoto: emp.profileImage || null,
          trade: emp.trade,
          lastMessage: chat.lastMessage,
          lastMessageTime: chat.lastMessageTime,
          unreadCount: 0,
        };
      })
      .filter(Boolean);

    return res.json({
      message: "Conversation list",
      data: result,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch conversations",
      error: error.message,
    });
  }
};

export default {
  sendMessage,
  getMessagesForEmployee,
  getConversations,
};