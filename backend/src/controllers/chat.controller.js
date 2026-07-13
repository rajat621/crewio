//backend/src/controllers/chat.controller.js
import Chat from '../models/Chat.js';
import Employee from '../models/Employee.js';
import Notification from '../models/Notification.js';
import { sendPushToEmployee } from '../services/push.service.js';
import mongoose from 'mongoose';

export const sendMessage = async (req, res) => {
  try {
    const payload = req.body || {};
    // Determine sender
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
      return res.status(401).json({ message: 'Not authenticated' });
    }

    if (!ownerId) {
      return res.status(400).json({ message: 'No office/owner is linked to this account yet' });
    }

    const toEmployeeId = payload.toEmployeeId;
    let to;
    let toEmp = null;

    if (isEmployeeSender && !toEmployeeId) {
      // Employee sending from the mobile app with no explicit recipient -
      // this always means "message my office/owner".
      to = ownerId;
    } else {
      if (!toEmployeeId) return res.status(400).json({ message: 'toEmployeeId required' });
      toEmp = await Employee.findOne({ _id: toEmployeeId, ownerId });
      if (!toEmp) return res.status(404).json({ message: 'Recipient employee not found' });
      to = toEmp._id;
    }

    const chat = await Chat.create({ from, to, text: payload.text || '', ownerId });

    // "If there is any new chat message then it will have notification" -
    // notify whichever side is on the receiving end.
    try {
      if (toEmp) {
        // Message going TO an employee (from the office, or in principle
        // another employee) - push + persisted notification on their phone.
        const notifTitle = isEmployeeSender ? 'New message' : 'New message from your office';
        const notifBody = payload.text || '';
        const notifPayload = { type: 'chat_message', fromId: String(from) };
        await sendPushToEmployee(toEmp, { title: notifTitle, body: notifBody, data: notifPayload });
        await Notification.create({
          user: toEmp._id,
          title: notifTitle,
          body: notifBody,
          payload: notifPayload,
          ownerId,
        });
      } else if (isEmployeeSender) {
        // Message going TO the office (employee messaging with no explicit
        // recipient) - persist a dashboard notification (existing bell
        // icon / GET /api/notifications for the owner).
        await Notification.create({
          user: ownerId,
          title: `New message from ${req.employee.name || 'an employee'}`,
          body: payload.text || '',
          payload: { type: 'chat_message', fromEmployeeId: String(from) },
          ownerId,
        });
      }
    } catch (err) {
      // A notification failure must never break message sending itself.
      console.error('[chat] Failed to notify recipient of new message', err.message);
    }

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