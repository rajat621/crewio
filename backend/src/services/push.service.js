import admin from 'firebase-admin';
import fs from 'fs';

/**
 * Firebase Cloud Messaging wrapper.
 *
 * Configuration (either works):
 *  - FIREBASE_SERVICE_ACCOUNT: the full service-account JSON as a single-line
 *    string (recommended for hosts like Render/Vercel env vars).
 *  - FIREBASE_SERVICE_ACCOUNT_PATH: filesystem path to the service-account
 *    JSON file (recommended for local/dev or containers with mounted secrets).
 *
 * If neither is set, push sending silently no-ops so the rest of the app
 * (attendance, sockets, everything else) keeps working in environments where
 * FCM hasn't been configured yet.
 */

let initialized = false;
let disabled = false;

const ensureInitialized = () => {
  if (initialized || disabled) return;

  try {
    let credentialJson = null;

    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      credentialJson = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } else if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
      credentialJson = JSON.parse(
        fs.readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT_PATH, 'utf8')
      );
    }

    if (!credentialJson) {
      console.warn('[push] FCM not configured (no FIREBASE_SERVICE_ACCOUNT[_PATH]) - push notifications disabled.');
      disabled = true;
      return;
    }

    if (!admin.apps.length) {
      admin.initializeApp({ credential: admin.credential.cert(credentialJson) });
    }
    initialized = true;
  } catch (error) {
    console.error('[push] Failed to initialize Firebase Admin - push notifications disabled.', error.message);
    disabled = true;
  }
};

/**
 * Send a push notification to a single employee device by FCM token.
 * Never throws - a push failure must never break the calling API request.
 */
export const sendPushToToken = async (fcmToken, { title, body, data = {} } = {}) => {
  ensureInitialized();
  if (disabled || !fcmToken) return { sent: false, reason: disabled ? 'fcm_disabled' : 'no_token' };

  try {
    // FCM data payloads must be flat string maps.
    const stringData = Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)])
    );

    await admin.messaging().send({
      token: fcmToken,
      notification: { title, body },
      data: stringData,
      android: { priority: 'high' },
      apns: { payload: { aps: { sound: 'default' } } },
    });
    return { sent: true };
  } catch (error) {
    console.error('[push] Failed to send push notification', error.message);
    return { sent: false, reason: error.message };
  }
};

/** Convenience wrapper: send to an Employee mongoose document (must have +fcmToken selected). */
export const sendPushToEmployee = async (employee, notification) => {
  if (!employee) return { sent: false, reason: 'no_employee' };

  let token = employee.fcmToken;

  // Employee.fcmToken is `select: false` on the schema (it's sensitive
  // device-binding data), so any document fetched the normal way - which
  // is every call site in this codebase - has it excluded/undefined here,
  // even when a real token is registered. Re-fetch it directly rather than
  // requiring every caller to remember `.select('+fcmToken')`.
  if (!token && employee._id) {
    try {
      const Employee = (await import('../models/Employee.js')).default;
      const withToken = await Employee.findById(employee._id).select('+fcmToken').lean();
      token = withToken?.fcmToken;
    } catch (err) {
      console.error('[push] Failed to re-fetch fcmToken for employee', employee._id, err.message);
    }
  }

  return sendPushToToken(token, notification);
};

export default { sendPushToToken, sendPushToEmployee };