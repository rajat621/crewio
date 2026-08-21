// Reusable gate for any premium API route. Must run AFTER authenticateToken
// (it relies on req.currentUser / req.user being populated already).
//
// Rule: allow if lifetimeAccess === true OR subscriptionStatus is active/trialing.
// Otherwise: 402/403 Unauthorized-style response so the frontend can redirect
// the user to /subscription.
import User from '../models/User.js';
import { serverError } from '../utils/apiResponse.js';

export const requireActiveSubscription = async (req, res, next) => {
  try {
    // authenticateToken already resolves and caches the subscription flags
    // onto req.user (see loadAuthUser/computeHasActiveAccess in
    // auth.middleware.js) for owner-token requests, so the common case here
    // needs zero extra DB work. Fall back to a fresh lookup only if that's
    // missing (e.g. middleware ordering was changed, or an employee token).
    if (typeof req.user?.hasActiveAccess === 'boolean') {
      if (!req.user.hasActiveAccess) {
        return res.status(403).json({
          message: 'An active subscription is required to access this resource.',
          code: 'SUBSCRIPTION_REQUIRED',
          subscriptionStatus: req.user.subscriptionStatus,
          lifetimeAccess: req.user.lifetimeAccess,
        });
      }
      return next();
    }

    if (!req.user?.userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const user = await User.findById(req.user.userId).select('subscriptionStatus lifetimeAccess trial');

    if (!user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (!user.hasActiveAccess()) {
      return res.status(403).json({
        message: 'An active subscription is required to access this resource.',
        code: 'SUBSCRIPTION_REQUIRED',
        subscriptionStatus: user.subscriptionStatus,
        lifetimeAccess: user.lifetimeAccess,
      });
    }

    return next();
  } catch (error) {
    console.error('Subscription check error:', error);
    return serverError(res, 'Failed to verify subscription status');
  }
};

export default requireActiveSubscription;
