// import User from '../models/User.js';
// import { env } from '../config/env.js';
// import { PLANS, getEnabledPlans, BILLING_INTERVALS } from '../config/plans.js';
// import {
//   getStripeClient,
//   createCheckoutSession,
//   createBillingPortalSession,
//   syncSubscriptionToUser,
//   markSubscriptionEnded,
//   findUserForStripeObject,
// } from '../services/stripe.service.js';

// const log = (stage, details = {}) => {
//   console.log(`[subscription] ${stage}`, details);
// };

// const getFrontendBase = (req) => {
//   const explicit = req.body?.frontend || req.query?.frontend;
//   if (explicit && /^https?:\/\//i.test(explicit)) {
//     return String(explicit).replace(/\/$/, '');
//   }
//   const origin = req.headers.origin || req.headers.referer?.split('/').slice(0, 3).join('/');
//   if (origin && /^https?:\/\//i.test(origin)) {
//     return origin.replace(/\/$/, '');
//   }
//   return (env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
// };

// // ---------------------------------------------------------------------------
// // GET /api/subscription/plans
// // Public plan catalog for the frontend to render pricing cards from. Only
// // exposes what's safe to show client-side (no Stripe secret data).
// // ---------------------------------------------------------------------------
// export const getPlans = async (req, res) => {
//   res.json({
//     plans: PLANS.map((plan) => ({
//       id: plan.id,
//       name: plan.name,
//       enabled: plan.enabled,
//       billingIntervals: plan.billingIntervals,
//       displayPrice: plan.displayPrice,
//       displayOldPrice: plan.displayOldPrice,
//       features: plan.features,
//     })),
//   });
// };

// // ---------------------------------------------------------------------------
// // GET /api/subscription/status
// // Tells the frontend everything it needs to decide whether to show the app
// // or redirect to /subscription.
// // ---------------------------------------------------------------------------
// export const getStatus = async (req, res) => {
//   try {
//     const userId = req.user?.userId;
//     if (!userId) return res.status(401).json({ message: 'Unauthorized' });

//     const user = await User.findById(userId);
//     if (!user) return res.status(404).json({ message: 'User not found' });

//     res.json({
//       lifetimeAccess: Boolean(user.lifetimeAccess),
//       subscriptionPlan: user.subscriptionPlan,
//       subscriptionStatus: user.subscriptionStatus,
//       billingCycle: user.billingCycle,
//       currentPeriodStart: user.currentPeriodStart,
//       currentPeriodEnd: user.currentPeriodEnd,
//       cancelAtPeriodEnd: user.cancelAtPeriodEnd,
//       hasActiveAccess: user.hasActiveAccess(),
//       hasBillingHistory: Boolean(user.stripeCustomerId),
//     });
//   } catch (error) {
//     console.error('Get subscription status error:', error);
//     res.status(500).json({ message: 'Failed to load subscription status', error: error.message });
//   }
// };

// // ---------------------------------------------------------------------------
// // POST /api/subscription/checkout-session
// // Body: { planId, billingCycle }
// // ---------------------------------------------------------------------------
// export const createCheckout = async (req, res) => {
//   try {
//     const userId = req.user?.userId;
//     if (!userId) return res.status(401).json({ message: 'Unauthorized' });

//     const { planId, billingCycle } = req.body || {};
//     if (!planId) {
//       return res.status(400).json({ message: 'planId is required' });
//     }

//     const user = await User.findById(userId);
//     if (!user) return res.status(404).json({ message: 'User not found' });

//     if (user.lifetimeAccess) {
//       return res.status(400).json({ message: 'This account already has lifetime access and does not need a subscription.' });
//     }

//     if (user.hasActiveAccess() && user.subscriptionPlan === planId) {
//       return res.status(400).json({ message: 'You already have an active subscription to this plan.' });
//     }

//     const frontend = getFrontendBase(req);
//     const cycle = billingCycle === BILLING_INTERVALS.YEARLY ? BILLING_INTERVALS.YEARLY : BILLING_INTERVALS.MONTHLY;

//     const session = await createCheckoutSession({
//       user,
//       planId,
//       billingCycle: cycle,
//       successUrl: `${frontend}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
//       cancelUrl: `${frontend}/subscription`,
//     });

//     log('checkout.session.created', { userId: String(user._id), planId, cycle, sessionId: session.id });
//     res.json({ url: session.url, sessionId: session.id });
//   } catch (error) {
//     console.error('Create checkout session error:', error);
//     res.status(500).json({ message: error.message || 'Failed to start checkout', error: error.message });
//   }
// };

// // ---------------------------------------------------------------------------
// // POST /api/subscription/portal-session
// // ---------------------------------------------------------------------------
// export const createPortalSession = async (req, res) => {
//   try {
//     const userId = req.user?.userId;
//     if (!userId) return res.status(401).json({ message: 'Unauthorized' });

//     const user = await User.findById(userId);
//     if (!user) return res.status(404).json({ message: 'User not found' });

//     if (user.lifetimeAccess) {
//       return res.status(400).json({ message: 'Lifetime-access accounts do not have a billing portal.' });
//     }

//     const frontend = getFrontendBase(req);
//     const session = await createBillingPortalSession({
//       user,
//       returnUrl: `${frontend}/user-profile`,
//     });

//     res.json({ url: session.url });
//   } catch (error) {
//     console.error('Create billing portal session error:', error);
//     res.status(400).json({ message: error.message || 'Failed to open billing portal' });
//   }
// };

// // ---------------------------------------------------------------------------
// // POST /api/subscription/webhook  (raw body — mounted before express.json())
// // ---------------------------------------------------------------------------
// export const handleWebhook = async (req, res) => {
//   const stripe = getStripeClient();
//   const signature = req.headers['stripe-signature'];

//   let event;
//   try {
//     if (!env.STRIPE_WEBHOOK_SECRET) {
//       throw new Error('STRIPE_WEBHOOK_SECRET is not configured.');
//     }
//     event = stripe.webhooks.constructEvent(req.body, signature, env.STRIPE_WEBHOOK_SECRET);
//   } catch (error) {
//     console.error('Stripe webhook signature verification failed:', error.message);
//     return res.status(400).send(`Webhook Error: ${error.message}`);
//   }

//   log('webhook.received', { type: event.type, id: event.id });

//   try {
//     switch (event.type) {
//       case 'checkout.session.completed': {
//         const session = event.data.object;
//         // Subscription mode: pull the full subscription object so we get
//         // status/price/period fields in one place, then sync.
//         const user = await findUserForStripeObject(session);
//         if (!user) {
//           log('webhook.checkout.completed.userNotFound', { customer: session.customer });
//           break;
//         }
//         if (user.lifetimeAccess) {
//           log('webhook.checkout.completed.skippedLifetimeUser', { userId: String(user._id) });
//           break;
//         }
//         if (session.subscription) {
//           const subscription = await stripe.subscriptions.retrieve(session.subscription);
//           await syncSubscriptionToUser({ user, subscription });
//         }
//         log('webhook.checkout.completed.synced', { userId: String(user._id) });
//         break;
//       }

//       case 'customer.subscription.created':
//       case 'customer.subscription.updated': {
//         const subscription = event.data.object;
//         const user = await findUserForStripeObject(subscription);
//         if (!user) {
//           log('webhook.subscription.upsert.userNotFound', { customer: subscription.customer });
//           break;
//         }
//         if (user.lifetimeAccess) {
//           log('webhook.subscription.upsert.skippedLifetimeUser', { userId: String(user._id) });
//           break;
//         }
//         await syncSubscriptionToUser({ user, subscription });
//         log('webhook.subscription.upsert.synced', { userId: String(user._id), status: subscription.status });
//         break;
//       }

//       case 'customer.subscription.deleted': {
//         const subscription = event.data.object;
//         const user = await findUserForStripeObject(subscription);
//         if (!user) {
//           log('webhook.subscription.deleted.userNotFound', { customer: subscription.customer });
//           break;
//         }
//         if (user.lifetimeAccess) {
//           log('webhook.subscription.deleted.skippedLifetimeUser', { userId: String(user._id) });
//           break;
//         }
//         await markSubscriptionEnded(user);
//         log('webhook.subscription.deleted.synced', { userId: String(user._id) });
//         break;
//       }

//       case 'invoice.paid': {
//         const invoice = event.data.object;
//         if (invoice.subscription) {
//           const user = await findUserForStripeObject(invoice);
//           if (user && !user.lifetimeAccess) {
//             const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
//             await syncSubscriptionToUser({ user, subscription });
//             log('webhook.invoice.paid.synced', { userId: String(user._id) });
//           }
//         }
//         break;
//       }

//       case 'invoice.payment_failed': {
//         const invoice = event.data.object;
//         const user = await findUserForStripeObject(invoice);
//         if (user && !user.lifetimeAccess) {
//           // Don't hand-roll a status here - re-fetch from Stripe so we reflect
//           // whatever state Stripe actually put the subscription in
//           // (e.g. 'past_due'), rather than guessing.
//           if (invoice.subscription) {
//             const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
//             await syncSubscriptionToUser({ user, subscription });
//           }
//           log('webhook.invoice.paymentFailed.synced', { userId: String(user._id) });
//         }
//         break;
//       }

//       default:
//         log('webhook.unhandled', { type: event.type });
//     }

//     res.json({ received: true });
//   } catch (error) {
//     console.error('Stripe webhook handling error:', error);
//     // Return 500 so Stripe retries the event rather than silently dropping it.
//     res.status(500).json({ message: 'Webhook handler failed', error: error.message });
//   }
// };

// export default {
//   getPlans,
//   getStatus,
//   createCheckout,
//   createPortalSession,
//   handleWebhook,
// };
import User from '../models/User.js';
import { env } from '../config/env.js';
import { PLANS, getEnabledPlans, BILLING_INTERVALS } from '../config/plans.js';
import { serverError, badRequest } from '../utils/apiResponse.js';
import { getAllowedOrigins } from '../config/corsOrigins.js';
import {
  getStripeClient,
  createCheckoutSession,
  createBillingPortalSession,
  syncSubscriptionToUser,
  markSubscriptionEnded,
  findUserForStripeObject,
} from '../services/stripe.service.js';

const log = (stage, details = {}) => {
  console.log(`[subscription] ${stage}`, details);
};

// Phase 12 finding (real): same root cause as the identical function in
// auth.controller.js - this value becomes Stripe's success_url/cancel_url/
// return_url, which Stripe redirects the user's browser to after a real
// checkout/portal session. Previously validated only the URL scheme, not
// the origin, so an authenticated user could be sent to an
// attacker-chosen page immediately after completing a real payment (a
// genuine phishing setup: "payment succeeded, re-enter your card"). Fixed
// to validate against the same allowlist CORS already uses.
const isAllowedFrontendOrigin = (candidate) => {
  if (!candidate || !/^https?:\/\//i.test(candidate)) return false;
  try {
    const candidateOrigin = new URL(candidate).origin;
    return getAllowedOrigins().some((allowed) => {
      try {
        return new URL(allowed).origin === candidateOrigin;
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
};

const getFrontendBase = (req) => {
  const explicit = req.body?.frontend || req.query?.frontend;
  if (isAllowedFrontendOrigin(explicit)) {
    return String(explicit).replace(/\/$/, '');
  }
  const origin = req.headers.origin || req.headers.referer?.split('/').slice(0, 3).join('/');
  if (isAllowedFrontendOrigin(origin)) {
    return origin.replace(/\/$/, '');
  }
  return (env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
};

// ---------------------------------------------------------------------------
// GET /api/subscription/plans
// Public plan catalog for the frontend to render pricing cards from. Only
// exposes what's safe to show client-side (no Stripe secret data).
// ---------------------------------------------------------------------------
export const getPlans = async (req, res) => {
  res.json({
    plans: PLANS.map((plan) => ({
      id: plan.id,
      name: plan.name,
      enabled: plan.enabled,
      billingIntervals: plan.billingIntervals,
      displayPrice: plan.displayPrice,
      displayOldPrice: plan.displayOldPrice,
      features: plan.features,
    })),
  });
};

// ---------------------------------------------------------------------------
// GET /api/subscription/status
// Tells the frontend everything it needs to decide whether to show the app
// or redirect to /subscription.
// ---------------------------------------------------------------------------
export const getStatus = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json({
      lifetimeAccess: Boolean(user.lifetimeAccess),
      subscriptionPlan: user.subscriptionPlan,
      subscriptionStatus: user.subscriptionStatus,
      billingCycle: user.billingCycle,
      currentPeriodStart: user.currentPeriodStart,
      currentPeriodEnd: user.currentPeriodEnd,
      cancelAtPeriodEnd: user.cancelAtPeriodEnd,
      hasActiveAccess: user.hasActiveAccess(),
      hasBillingHistory: Boolean(user.stripeCustomerId),
      // Application-managed free trial snapshot (see services/trial.service.js).
      trial: {
        endsAt: user.trial?.endsAt || null,
        isActive: user.isTrialActive(),
        daysRemaining: user.trialDaysRemaining(),
      },
    });
  } catch (error) {
    console.error('Get subscription status error:', error);
    return serverError(res, 'Failed to load subscription status');
  }
};

// ---------------------------------------------------------------------------
// POST /api/subscription/checkout-session
// Body: { planId, billingCycle }
// ---------------------------------------------------------------------------
export const createCheckout = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const { planId, billingCycle } = req.body || {};
    if (!planId) {
      return res.status(400).json({ message: 'planId is required' });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.lifetimeAccess) {
      return res.status(400).json({ message: 'This account already has lifetime access and does not need a subscription.' });
    }

    if (user.hasActiveAccess() && user.subscriptionPlan === planId) {
      return res.status(400).json({ message: 'You already have an active subscription to this plan.' });
    }

    const frontend = getFrontendBase(req);
    const cycle = billingCycle === BILLING_INTERVALS.YEARLY ? BILLING_INTERVALS.YEARLY : BILLING_INTERVALS.MONTHLY;

    const session = await createCheckoutSession({
      user,
      planId,
      billingCycle: cycle,
      successUrl: `${frontend}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${frontend}/subscription`,
    });

    log('checkout.session.created', { userId: String(user._id), planId, cycle, sessionId: session.id });
    res.json({ url: session.url, sessionId: session.id });
  } catch (error) {
    console.error('Create checkout session error:', error);
    return serverError(res, 'Failed to start checkout');
  }
};

// ---------------------------------------------------------------------------
// POST /api/subscription/portal-session
// ---------------------------------------------------------------------------
export const createPortalSession = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.lifetimeAccess) {
      return res.status(400).json({ message: 'Lifetime-access accounts do not have a billing portal.' });
    }

    const frontend = getFrontendBase(req);
    const session = await createBillingPortalSession({
      user,
      returnUrl: `${frontend}/user-profile`,
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('Create billing portal session error:', error);
    return badRequest(res, 'Failed to open billing portal');
  }
};

// ---------------------------------------------------------------------------
// POST /api/subscription/webhook  (raw body — mounted before express.json())
// ---------------------------------------------------------------------------
export const handleWebhook = async (req, res) => {
  const stripe = getStripeClient();
  const signature = req.headers['stripe-signature'];

  let event;
  try {
    if (!env.STRIPE_WEBHOOK_SECRET) {
      // D19.12 finding: this was previously thrown as a plain Error and
      // caught by the generic handler below, which sent its exact message
      // - naming the missing env var - directly to whoever hits this
      // public, unauthenticated endpoint. Stripe's own signature-mismatch
      // error text (the other case this catch handles) is fine to pass
      // through as-is: that's Stripe's own documented, standard webhook
      // pattern and its message is a fixed, generic phrase with no
      // internal detail. A server misconfiguration is a different class
      // of thing and shouldn't describe itself to an anonymous caller.
      console.error('Stripe webhook signature verification failed: STRIPE_WEBHOOK_SECRET is not configured.');
      return res.status(500).send('Webhook processing is not available.');
    }
    event = stripe.webhooks.constructEvent(req.body, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    console.error('Stripe webhook signature verification failed:', error.message);
    return res.status(400).send(`Webhook Error: ${error.message}`);
  }

  log('webhook.received', { type: event.type, id: event.id });

  // Closure-pass finding: no explicit event.id dedup store exists here.
  // Traced every case below plus their two shared side-effect functions
  // (syncSubscriptionToUser, markSubscriptionEnded - services/stripe.service.js)
  // and confirmed this is safely idempotent by construction, not merely
  // "good enough":
  //   - Every case is a pure field overwrite onto the one User document
  //     resolved by findUserForStripeObject - subscriptionStatus,
  //     stripePriceId, currentPeriodStart/End, cancelAtPeriodEnd, etc. -
  //     re-derived either from the event's own canonical object or a fresh
  //     stripe.subscriptions.retrieve() call, never incremented or appended.
  //   - No case creates a new document, no case sends an email/notification,
  //     no case calls out to another service. Grepped User.js for
  //     pre('save')/post('save') hooks - none exist, so a Mongoose .save()
  //     here can't trigger a hidden side effect either.
  //   - A duplicate delivery therefore just re-runs the same
  //     read-canonical-state-then-overwrite, converging to the same result
  //     regardless of delivery order or count. A concurrent duplicate can at
  //     worst cause one redundant Mongo write, not a double-charge, a
  //     duplicate record, or a duplicate email.
  // If a future case is added that creates a record or has a one-time side
  // effect (e.g. a "first payment" welcome email), it needs its own explicit
  // dedup check - this reasoning does not automatically extend to it.
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        // Subscription mode: pull the full subscription object so we get
        // status/price/period fields in one place, then sync.
        const user = await findUserForStripeObject(session);
        if (!user) {
          log('webhook.checkout.completed.userNotFound', { customer: session.customer });
          break;
        }
        if (user.lifetimeAccess) {
          log('webhook.checkout.completed.skippedLifetimeUser', { userId: String(user._id) });
          break;
        }
        if (session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(session.subscription);
          await syncSubscriptionToUser({ user, subscription });
        }
        log('webhook.checkout.completed.synced', { userId: String(user._id) });
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const user = await findUserForStripeObject(subscription);
        if (!user) {
          log('webhook.subscription.upsert.userNotFound', { customer: subscription.customer });
          break;
        }
        if (user.lifetimeAccess) {
          log('webhook.subscription.upsert.skippedLifetimeUser', { userId: String(user._id) });
          break;
        }
        await syncSubscriptionToUser({ user, subscription });
        log('webhook.subscription.upsert.synced', { userId: String(user._id), status: subscription.status });
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const user = await findUserForStripeObject(subscription);
        if (!user) {
          log('webhook.subscription.deleted.userNotFound', { customer: subscription.customer });
          break;
        }
        if (user.lifetimeAccess) {
          log('webhook.subscription.deleted.skippedLifetimeUser', { userId: String(user._id) });
          break;
        }
        await markSubscriptionEnded(user);
        log('webhook.subscription.deleted.synced', { userId: String(user._id) });
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object;
        if (invoice.subscription) {
          const user = await findUserForStripeObject(invoice);
          if (user && !user.lifetimeAccess) {
            const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
            await syncSubscriptionToUser({ user, subscription });
            log('webhook.invoice.paid.synced', { userId: String(user._id) });
          }
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const user = await findUserForStripeObject(invoice);
        if (user && !user.lifetimeAccess) {
          // Don't hand-roll a status here - re-fetch from Stripe so we reflect
          // whatever state Stripe actually put the subscription in
          // (e.g. 'past_due'), rather than guessing.
          if (invoice.subscription) {
            const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
            await syncSubscriptionToUser({ user, subscription });
          }
          log('webhook.invoice.paymentFailed.synced', { userId: String(user._id) });
        }
        break;
      }

      default:
        log('webhook.unhandled', { type: event.type });
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Stripe webhook handling error:', error);
    // Return 500 so Stripe retries the event rather than silently dropping it.
    return res.status(500).send('Webhook handler failed');
  }
};

export default {
  getPlans,
  getStatus,
  createCheckout,
  createPortalSession,
  handleWebhook,
};