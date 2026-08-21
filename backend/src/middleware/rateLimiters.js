import rateLimit from 'express-rate-limit';

// Applied globally to every request. Generous enough not to bother real
// users, tight enough to blunt scraping/DoS attempts against a single IP.
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests. Please try again in a few minutes.' },
});

// Applied to login/OTP/refresh endpoints specifically. This is the one that
// actually matters for brute force / credential stuffing - keep it strict.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // only counts failed attempts against the limit
  message: { message: 'Too many attempts. Please wait 15 minutes before trying again.' },
});

// A looser limiter for things like resend-otp, which a legitimate user might
// hit a few times in quick succession but which is still abuse-prone.
export const moderateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests. Please try again shortly.' },
});

// For expensive operations - AI extraction (calls an external provider,
// consumes OCR/processing resources) and file upload (storage + bandwidth).
// The global apiLimiter (300/15min) still applies underneath this, but
// isn't proportionate on its own to the actual per-request cost here.
export const expensiveOperationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests for this operation. Please try again shortly.' },
});

export default { apiLimiter, authLimiter, moderateLimiter, expensiveOperationLimiter };
