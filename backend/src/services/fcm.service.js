import admin from 'firebase-admin';
import { createRequire } from 'module';
import { env } from '../config/env.js';

// NOTE: this file isn't wired into any active route (device.controller.js
// and test.controller.js, its only two importers, are both currently
// unmounted in app.js) - push.service.js is the implementation everything
// else in the app actually uses. Left working rather than deleted in case
// something still imports it.
const require = createRequire(import.meta.url);

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
