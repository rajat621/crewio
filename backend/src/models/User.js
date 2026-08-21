// import mongoose from "mongoose";
// import { LEGAL_BUNDLE_VERSION } from "../config/legalDocuments.js";

// const userSchema = new mongoose.Schema(
//   {
//     firstName: {
//       type: String,
//       required: true,
//       trim: true,
//     },

//     lastName: {
//       type: String,
//       trim: true,
//     },
//     email: {
//       type: String,
//       required: true,
//       unique: true,
//       lowercase: true,
//       index: true,
//     },

//     passwordHash: {
//       type: String,
//       select: false,
//     },

//     password: {
//       type: String,
//       select: false,
//     },

//     role: {
//       type: String,
//       enum: ["OWNER", "owner"],
//       default: "OWNER",
//     },

//     company: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "Company",
//     },

//     mobileNumber: String,

//     countryCode: String,

//     dateOfBirth: String,

//     gender: String,

//     avatar: String,

//     isEmailVerified: {
//       type: Boolean,
//       default: false,
//     },

//     isVerified: {
//       type: Boolean,
//       default: false,
//     },

//     onboardingCompleted: {
//       type: Boolean,
//       default: false,
//     },

//     otp: String,

//     otpExpiresAt: Date,

//     otpExpiry: Date,

//     lastLoginAt: Date,

//     // Bumped on password change / logout-everywhere to invalidate all JWTs
//     // issued before that point.
//     tokenVersion: {
//       type: Number,
//       default: 0,
//     },

//     // Google Authenticator (TOTP) 2FA
//     twoFactorEnabled: {
//       type: Boolean,
//       default: false,
//     },
//     // Confirmed secret used once 2FA is enabled (only set after verification)
//     twoFactorSecret: {
//       type: String,
//       select: false,
//     },
//     // Secret generated during setup, pending confirmation via verify step
//     twoFactorTempSecret: {
//       type: String,
//       select: false,
//     },

//     // --- Subscription (Stripe) --------------------------------------------
//     // Which plan this account is on. Null until the user completes checkout
//     // (or is granted lifetime access).
//     subscriptionPlan: {
//       type: String,
//       enum: ['plus', 'pro', 'ultra', null],
//       default: null,
//     },
//     // Mirrors Stripe subscription status ('active', 'trialing', 'past_due',
//     // 'canceled', 'incomplete', 'incomplete_expired', 'unpaid', 'paused') plus
//     // our own 'none' default for accounts that never started a subscription.
//     subscriptionStatus: {
//       type: String,
//       enum: [
//         'none',
//         'active',
//         'trialing',
//         'past_due',
//         'canceled',
//         'incomplete',
//         'incomplete_expired',
//         'unpaid',
//         'paused',
//       ],
//       default: 'none',
//     },
//     stripeCustomerId: {
//       type: String,
//       default: null,
//       index: true,
//     },
//     stripeSubscriptionId: {
//       type: String,
//       default: null,
//       index: true,
//     },
//     stripePriceId: {
//       type: String,
//       default: null,
//     },
//     billingCycle: {
//       type: String,
//       enum: ['monthly', 'yearly', null],
//       default: null,
//     },
//     // Internal-only flag, set manually via MongoDB. Grants permanent premium
//     // access and bypasses Stripe entirely. There is intentionally no API or
//     // UI path that can set this to true.
//     lifetimeAccess: {
//       type: Boolean,
//       default: false,
//     },
//     currentPeriodStart: {
//       type: Date,
//       default: null,
//     },
//     currentPeriodEnd: {
//       type: Date,
//       default: null,
//     },
//     // True once Stripe confirms the subscription will not renew (user hit
//     // "Cancel" in the billing portal) but access remains until currentPeriodEnd.
//     cancelAtPeriodEnd: {
//       type: Boolean,
//       default: false,
//     },

//     // --- Legal / compliance ------------------------------------------------
//     // Denormalized snapshot of the user's most recent legal-agreement
//     // acceptance (signup checkbox, or the re-consent gate after a version
//     // bump), for fast "is this user current" checks. The full, permanent,
//     // append-only audit trail lives in the LegalAcceptance collection - this
//     // field is never the source of truth for compliance evidence, only a
//     // cache of it.
//     legalAcceptance: {
//       version: { type: String, default: null },
//       acceptedAt: { type: Date, default: null },
//       acceptedIp: { type: String, default: null },
//       acceptedUserAgent: { type: String, default: null },
//     },
//   },
//   {
//     timestamps: true,
//   }
// );

// // Single source of truth for "does this user get into the app". Lifetime
// // accounts always pass; everyone else needs an active/trialing Stripe
// // subscription. Used by both the requireActiveSubscription middleware and
// // the login/route-protection checks on the frontend (via /api/subscription/status).
// userSchema.methods.hasActiveAccess = function hasActiveAccess() {
//   if (this.lifetimeAccess === true) return true;
//   return this.subscriptionStatus === 'active' || this.subscriptionStatus === 'trialing';
// };

// // True whenever the user has never accepted the legal bundle, or accepted an
// // older version of it than what's currently in force (e.g. after a T&Cs
// // update). Drives the mandatory re-consent gate shown on next login.
// userSchema.methods.needsLegalReacceptance = function needsLegalReacceptance() {
//   const acceptedVersion = this.legalAcceptance?.version;
//   return acceptedVersion !== LEGAL_BUNDLE_VERSION;
// };

// export default mongoose.model("User", userSchema);

import mongoose from "mongoose";
import { LEGAL_BUNDLE_VERSION } from "../config/legalDocuments.js";

const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: true,
      trim: true,
    },

    lastName: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      index: true,
    },

    passwordHash: {
      type: String,
      select: false,
    },

    password: {
      type: String,
      select: false,
    },

    role: {
      type: String,
      enum: ["OWNER", "owner"],
      default: "OWNER",
    },

    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
    },

    mobileNumber: String,

    countryCode: String,

    dateOfBirth: String,

    gender: String,

    avatar: String,

    isEmailVerified: {
      type: Boolean,
      default: false,
    },

    isVerified: {
      type: Boolean,
      default: false,
    },

    onboardingCompleted: {
      type: Boolean,
      default: false,
    },

    otp: { type: String, select: false },

    otpExpiresAt: { type: Date, select: false },

    otpExpiry: { type: Date, select: false },

    // Failed verification attempts against the current otp. The rate
    // limiter on /verify-otp is per-IP (express-rate-limit's default
    // key), so a distributed attacker gets a fresh 10-attempt
    // allowance per IP against the same target account. This counter
    // invalidates the OTP itself after a handful of wrong guesses,
    // closing that gap without the account-lockout DoS risk a
    // per-account rate limit would introduce.
    otpAttempts: { type: Number, default: 0 },

    // Password-reset OTP state - kept entirely separate from the otp/
    // otpAttempts fields above (used by signup/signin/resend) so a
    // password-reset request in progress can never collide with or be
    // overwritten by an unrelated login-verification OTP for the same
    // account, and vice versa.
    passwordResetOtp: { type: String, select: false },
    passwordResetOtpExpiresAt: { type: Date, select: false },
    passwordResetOtpAttempts: { type: Number, default: 0, select: false },
    // Short-lived, single-use token issued after successful OTP
    // verification, required by the actual password-reset step so that
    // step doesn't need the OTP re-entered and can't be reached without
    // having verified it first.
    passwordResetToken: { type: String, select: false },
    passwordResetTokenExpiresAt: { type: Date, select: false },

    lastLoginAt: Date,

    // Bumped on password change / logout-everywhere to invalidate all JWTs
    // issued before that point.
    tokenVersion: {
      type: Number,
      default: 0,
    },

    // Google Authenticator (TOTP) 2FA
    twoFactorEnabled: {
      type: Boolean,
      default: false,
    },
    // Confirmed secret used once 2FA is enabled (only set after verification)
    twoFactorSecret: {
      type: String,
      select: false,
    },
    // Secret generated during setup, pending confirmation via verify step
    twoFactorTempSecret: {
      type: String,
      select: false,
    },

    // --- Subscription (Stripe) --------------------------------------------
    // Which plan this account is on. Null until the user completes checkout
    // (or is granted lifetime access).
    subscriptionPlan: {
      type: String,
      enum: ['plus', 'pro', 'ultra', null],
      default: null,
    },
    // Mirrors Stripe subscription status ('active', 'trialing', 'past_due',
    // 'canceled', 'incomplete', 'incomplete_expired', 'unpaid', 'paused') plus
    // our own 'none' default for accounts that never started a subscription.
    subscriptionStatus: {
      type: String,
      enum: [
        'none',
        'active',
        'trialing',
        'past_due',
        'canceled',
        'incomplete',
        'incomplete_expired',
        'unpaid',
        'paused',
      ],
      default: 'none',
    },
    stripeCustomerId: {
      type: String,
      default: null,
      index: true,
    },
    stripeSubscriptionId: {
      type: String,
      default: null,
      index: true,
    },
    stripePriceId: {
      type: String,
      default: null,
    },
    billingCycle: {
      type: String,
      enum: ['monthly', 'yearly', null],
      default: null,
    },
    // Internal-only flag, set manually via MongoDB. Grants permanent premium
    // access and bypasses Stripe entirely. There is intentionally no API or
    // UI path that can set this to true.
    lifetimeAccess: {
      type: Boolean,
      default: false,
    },
    currentPeriodStart: {
      type: Date,
      default: null,
    },
    currentPeriodEnd: {
      type: Date,
      default: null,
    },
    // True once Stripe confirms the subscription will not renew (user hit
    // "Cancel" in the billing portal) but access remains until currentPeriodEnd.
    cancelAtPeriodEnd: {
      type: Boolean,
      default: false,
    },

    // --- Temporary application-managed free trial ---------------------------
    // Launch mechanism used until Stripe checkout is live for real customers.
    // Application-managed (not a Stripe trial): granted once at signup for
    // brand-new non-lifetime users when ENABLE_FREE_TRIAL is on. Left in
    // place (and still honored by hasActiveAccess()) even after the flag is
    // later turned off, so existing trial users keep whatever they were
    // granted - only new signups stop receiving one.
    trial: {
      startedAt: { type: Date, default: null },
      endsAt: { type: Date, default: null },
      // Set true the moment a trial is granted, so a user can never receive
      // a second trial (e.g. if they were ever re-granted lifetime=false).
      used: { type: Boolean, default: false },
    },

    // --- Legal / compliance ------------------------------------------------
    // Denormalized snapshot of the user's most recent legal-agreement
    // acceptance (signup checkbox, or the re-consent gate after a version
    // bump), for fast "is this user current" checks. The full, permanent,
    // append-only audit trail lives in the LegalAcceptance collection - this
    // field is never the source of truth for compliance evidence, only a
    // cache of it.
    legalAcceptance: {
      version: { type: String, default: null },
      acceptedAt: { type: Date, default: null },
      acceptedIp: { type: String, default: null },
      acceptedUserAgent: { type: String, default: null },
    },
  },
  {
    timestamps: true,
  }
);

// Single source of truth for "does this user get into the app". Priority
// order: Lifetime Access > active/trialing Stripe subscription > active
// application-managed free trial > deny. Used by both the
// requireActiveSubscription middleware and the login/route-protection
// checks on the frontend (via /api/subscription/status and /api/auth/me).
userSchema.methods.hasActiveAccess = function hasActiveAccess() {
  if (this.lifetimeAccess === true) return true;
  if (this.subscriptionStatus === 'active' || this.subscriptionStatus === 'trialing') return true;
  return this.isTrialActive();
};

// True while today's date is still before the stored trial end date.
// Independent of the ENABLE_FREE_TRIAL flag on purpose: disabling the flag
// only stops new trials from being granted at signup, it must never cut
// short a trial that was already handed out.
userSchema.methods.isTrialActive = function isTrialActive() {
  return Boolean(this.trial?.endsAt) && new Date() < new Date(this.trial.endsAt);
};

// Whole days left in the trial (0 once it's expired), for UI messaging.
userSchema.methods.trialDaysRemaining = function trialDaysRemaining() {
  if (!this.isTrialActive()) return 0;
  const msRemaining = new Date(this.trial.endsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(msRemaining / (24 * 60 * 60 * 1000)));
};

// True whenever the user has never accepted the legal bundle, or accepted an
// older version of it than what's currently in force (e.g. after a T&Cs
// update). Drives the mandatory re-consent gate shown on next login.
userSchema.methods.needsLegalReacceptance = function needsLegalReacceptance() {
  const acceptedVersion = this.legalAcceptance?.version;
  return acceptedVersion !== LEGAL_BUNDLE_VERSION;
};

export default mongoose.model("User", userSchema);

