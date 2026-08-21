import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import User from '../models/User.js';
import { serverError } from '../utils/apiResponse.js';
import Employee from '../models/Employee.js';
import { getRequestContext } from './requestStore.js';
import { cacheGetOrSet, cacheInvalidate } from '../utils/cache.util.js';

// Every authenticated API request needs the same handful of
// authorization-critical fields off the User document: tokenVersion (session
// revocation), role/company/ownerId (authorization + tenant scoping), and
// the subscription flags (paywall gate). Previously this was a fresh
// `User.findById().populate('company')` - two full-document round trips -
// on literally every request, which is what made a 9-request page load like
// the dashboard serialize on connection-pool contention (60-430ms each).
//
// What's cached here is ONLY those authorization-critical fields, never the
// password hash, OTP/2FA secrets, or anything else off the user document.
// Staleness is bounded two ways:
//   1. A short TTL (AUTH_CACHE_TTL_SECONDS) as a safety net.
//   2. Write-through invalidation (invalidateAuthCache) called from every
//      place that mutates one of these fields: password change/reset,
//      logout ("logout everywhere" bumps tokenVersion), and the Stripe
//      subscription sync/cancel paths. In the common case staleness is
//      therefore ~0, not the TTL.
// tokenVersion itself is what makes this safe for revocation: even a stale
// cache entry still correctly rejects a token whose tokenVersion no longer
// matches, because tokenVersion is part of the cached snapshot and is
// invalidated write-through on every event that changes it.
const AUTH_CACHE_TTL_SECONDS = 5;
const authCacheKey = (userId) => `auth:user:${userId}`;

export const invalidateAuthCache = (userId) => {
  if (!userId) return Promise.resolve();
  return cacheInvalidate(authCacheKey(String(userId)));
};

// Mirrors User#hasActiveAccess()/#isTrialActive() but operates on the
// lean/cached field snapshot instead of a hydrated Mongoose document.
const computeHasActiveAccess = ({ lifetimeAccess, subscriptionStatus, trialEndsAt }) => {
  if (lifetimeAccess) return true;
  if (subscriptionStatus === 'active' || subscriptionStatus === 'trialing') return true;
  return Boolean(trialEndsAt) && new Date() < new Date(trialEndsAt);
};

const loadAuthUser = (userId) => cacheGetOrSet(authCacheKey(userId), AUTH_CACHE_TTL_SECONDS, async () => {
  // .select + .lean(): only the authorization-critical fields, no Mongoose
  // document hydration. .populate('company') is narrowed to just the field
  // this middleware actually reads (ownerId/owner) instead of the full
  // company document.
  const dbUser = await User.findById(userId)
    .select('email role company tokenVersion lifetimeAccess subscriptionStatus trial')
    .populate({ path: 'company', select: 'ownerId owner' })
    .lean();
  if (!dbUser) return null;

  const isOwner = String(dbUser.role || '').toUpperCase() === 'OWNER';
  return {
    userId: String(dbUser._id),
    email: dbUser.email,
    role: isOwner ? 'OWNER' : dbUser.role,
    isOwner,
    companyId: dbUser.company?._id ? String(dbUser.company._id) : null,
    companyOwnerId: dbUser.company
      ? String(dbUser.company.ownerId || dbUser.company.owner || '') || null
      : null,
    tokenVersion: dbUser.tokenVersion || 0,
    lifetimeAccess: Boolean(dbUser.lifetimeAccess),
    subscriptionStatus: dbUser.subscriptionStatus || 'none',
    trialEndsAt: dbUser.trial?.endsAt || null,
  };
});

const findEmployeeFromDecodedToken = async (decoded = {}) => {
  const identifiers = [decoded.employeeId, decoded.empId, decoded.appUserId, decoded.userId].filter(Boolean);

  for (const identifier of identifiers) {
    const employee = await Employee.findOne({
      $or: [
        { _id: identifier },
        { employeeId: identifier },
        { appUserId: identifier },
      ],
    }).select('-appPassword');
    if (employee) return employee;
  }

  return null;
};

export const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
    } catch (err) {
      return res.status(403).json({ message: 'Invalid or expired token' });
    }

    // Refresh tokens must never be usable as access tokens.
    if (decoded.tokenType === 'refresh') {
      return res.status(403).json({ message: 'Access denied: refresh token cannot be used for API access' });
    }

    // Attach the raw decoded token for reference
    req.auth = decoded;

    // Fetch canonical (cached) authorization data for this user
    try {
      const authUser = await loadAuthUser(decoded.userId);
      if (!authUser) {
        // Fallback: if token was an employee mobile token, try loading employee
        const emp = await findEmployeeFromDecodedToken(decoded);
        if (emp) {
          // Reject tokens issued before the employee's last logout/lock/reset.
          if (typeof decoded.tokenVersion === 'number' && decoded.tokenVersion !== (emp.tokenVersion || 0)) {
            return res.status(401).json({ message: 'Session expired. Please log in again.' });
          }
          req.employee = emp;
          return next();
        }
        return res.status(401).json({ message: 'User not found' });
      }

      // Reject tokens issued before the user's last password change/logout-everywhere.
      if (typeof decoded.tokenVersion === 'number' && decoded.tokenVersion !== authUser.tokenVersion) {
        return res.status(401).json({ message: 'Session expired. Please log in again.' });
      }

      const ownerId = authUser.isOwner
        ? authUser.userId
        : (authUser.companyOwnerId || decoded.ownerId || null);

      // Normalized req.user used across controllers. Subscription flags are
      // included so requireActiveSubscription can reuse this same cached
      // lookup instead of doing its own fresh User.findById on every
      // subscription-gated route.
      req.user = {
        userId: authUser.userId,
        email: authUser.email,
        role: authUser.role,
        companyId: authUser.companyId,
        ownerId: ownerId ? String(ownerId) : null,
        lifetimeAccess: authUser.lifetimeAccess,
        subscriptionStatus: authUser.subscriptionStatus,
        hasActiveAccess: computeHasActiveAccess(authUser),
      };

      // Observability only - enriches the async request store (see
      // requestStore.js) so slow-query logs can be correlated with the
      // authenticated user, without changing anything about the auth
      // response or control flow above.
      const obsContext = getRequestContext();
      if (obsContext) {
        obsContext.userId = req.user.userId;
        obsContext.ownerId = req.user.ownerId;
      }

      return next();
    } catch (dbError) {
      console.error('Auth middleware DB lookup failed:', dbError);
      return serverError(res, 'Failed to load user for auth');
    }
  } catch (error) {
    console.error('Authentication error:', error);
    return serverError(res, 'Authentication error');
  }
};

export default authenticateToken;
