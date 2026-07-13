import admin from 'firebase-admin';
import { env } from '../config/env.js';

let initialized = false;

export const initFcm = () => {
  if (initialized) return admin;
  try {
    if (!env.FIREBASE_SERVICE_ACCOUNT_JSON && !env.FIREBASE_SERVICE_ACCOUNT_PATH) {
      console.warn('FCM not configured: missing FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_PATH');
      return null;
    }

    const serviceAccount = env.FIREBASE_SERVICE_ACCOUNT_JSON ? JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON) : require(env.FIREBASE_SERVICE_ACCOUNT_PATH);

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    initialized = true;
    console.log('FCM initialized');
    return admin;
  } catch (err) {
    console.warn('Failed to init FCM:', err && err.message);
    return null;
  }
};

export const sendPushToDevice = async (deviceToken, payload) => {
  try {
    const client = initFcm();
    if (!client) return null;
    const message = { token: deviceToken, notification: { title: payload.title || 'Notification', body: payload.body || '' }, data: payload.data || {} };
    const resp = await client.messaging().send(message);
    return resp;
  } catch (err) {
    console.warn('FCM send error', err && err.message);
    return null;
  }
};

export default { initFcm, sendPushToDevice };
