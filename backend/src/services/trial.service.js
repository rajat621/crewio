// Centralized trial-granting logic for the temporary 15-day application-
// managed free trial (launch mechanism used until Stripe checkout is live
// for real customers). Kept as a single place so both signup entry points
// (email/OTP signup and Google OAuth signup) stay in sync, and so removing
// the trial later is a one-line config flip (see config/env.js).
import { env } from '../config/env.js';

// Mutates `user` in place with trial.startedAt/endsAt/used when eligible.
// Does NOT save - callers are expected to persist the user themselves
// (signup already does `await user.save()` right after user construction).
//
// Eligibility: brand-new, never lifetime, never already granted a trial,
// and the feature flag is on. Safe to call unconditionally at signup.
export const grantTrialIfEligible = (user) => {
  if (!env.ENABLE_FREE_TRIAL) return user;
  if (!user) return user;
  if (user.lifetimeAccess) return user;
  if (user.trial?.used) return user;

  const startedAt = new Date();
  const endsAt = new Date(startedAt.getTime() + env.FREE_TRIAL_DAYS * 24 * 60 * 60 * 1000);

  user.trial = { startedAt, endsAt, used: true };
  return user;
};

export default { grantTrialIfEligible };