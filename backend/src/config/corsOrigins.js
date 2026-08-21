// Single source of truth for the CORS allow-list, shared by app.js (REST)
// and socket.service.js (Socket.IO) - previously each kept its own
// hardcoded copy of this list, and they had already drifted:
// socket.service.js was missing 'https://app.crewio.ae', meaning the
// dashboard's custom domain worked for REST calls but silently failed
// CORS on socket connections (live attendance/chat/notifications).
//
// ALLOWED_ORIGINS (optional): comma-separated list, e.g.
//   ALLOWED_ORIGINS=https://app.crewio.ae,https://crewio-rust.vercel.app
// When unset, falls back to DEFAULT_ORIGINS below - localhost dev origins
// are only included there outside NODE_ENV=production, so an unset
// ALLOWED_ORIGINS in production can't accidentally leave a local dev
// server able to make credentialed cross-origin requests against prod.
const DEV_ONLY_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:5175',
];

const PRODUCTION_ORIGINS = [
  'https://crewio-rust.vercel.app',
  'https://app.crewio.ae',
];

const DEFAULT_ORIGINS = process.env.NODE_ENV === 'production'
  ? PRODUCTION_ORIGINS
  : [...DEV_ONLY_ORIGINS, ...PRODUCTION_ORIGINS];

export const getAllowedOrigins = () => {
  const fromEnv = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  const origins = fromEnv.length > 0 ? fromEnv : DEFAULT_ORIGINS;

  return Array.from(new Set([process.env.FRONTEND_URL, ...origins].filter(Boolean)));
};

// The dev tooling (Vite/nodemon "autoPort") reassigns whatever port is free
// when 5173-5175 are already taken by another concurrently-running dev
// session, so a fixed port list is too brittle for local dev. Outside
// production, accept any localhost/127.0.0.1 origin regardless of port
// instead of maintaining a growing hardcoded list. Never applies in
// production - PRODUCTION_ORIGINS above stays the sole allow-list there.
const LOCALHOST_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export const isAllowedOrigin = (origin, allowedOrigins) => {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  if (process.env.NODE_ENV !== 'production' && LOCALHOST_ORIGIN_RE.test(origin)) return true;
  return false;
};
