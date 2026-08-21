import Stripe from 'stripe';
import { env } from '../config/env.js';
import User from '../models/User.js';
import { getPlanById, getPriceIdForPlan, getPlanByPriceId, BILLING_INTERVALS } from '../config/plans.js';
import { invalidateAuthCache } from '../middleware/auth.middleware.js';

let stripeClient = null;

// Lazily construct the Stripe client so a missing STRIPE_SECRET_KEY doesn't
// crash the whole app at import time (e.g. in dev before Stripe is configured)
// - it only fails the specific request that needed it.
export const getStripeClient = () => {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error('Stripe is not configured: STRIPE_SECRET_KEY is missing.');
  }
  if (!stripeClient) {
    stripeClient = new Stripe(env.STRIPE_SECRET_KEY, {
      apiVersion: '2024-06-20',
    });
  }
  return stripeClient;
};

/**
 * Ensures the given user has a Stripe Customer, creating one if needed.
 * Lifetime users never reach this path in normal operation, but we guard
 * against it anyway since it's cheap and correct.
 */
export const ensureStripeCustomer = async (user) => {
  if (user.lifetimeAccess) {
    throw new Error('Lifetime-access accounts do not use Stripe.');
  }

  if (user.stripeCustomerId) {
    return user.stripeCustomerId;
  }

  const stripe = getStripeClient();
  const customer = await stripe.customers.create({
    email: user.email,
    name: [user.firstName, user.lastName].filter(Boolean).join(' ') || undefined,
    metadata: { userId: String(user._id) },
  });

  user.stripeCustomerId = customer.id;
  await user.save();
  return customer.id;
};

/**
 * Creates a Stripe Checkout Session for the given plan/billing cycle and
 * returns its URL. The frontend just redirects the browser to that URL.
 */
export const createCheckoutSession = async ({ user, planId, billingCycle, successUrl, cancelUrl }) => {
  if (user.lifetimeAccess) {
    throw new Error('Lifetime-access accounts cannot start a checkout session.');
  }

  const plan = getPlanById(planId);
  if (!plan || !plan.enabled) {
    throw new Error(`Plan "${planId}" is not available for purchase.`);
  }

  const cycle = billingCycle === BILLING_INTERVALS.YEARLY ? BILLING_INTERVALS.YEARLY : BILLING_INTERVALS.MONTHLY;
  const priceId = getPriceIdForPlan(planId, cycle);
  if (!priceId) {
    throw new Error(`No Stripe Price ID configured for plan "${planId}" (${cycle}).`);
  }

  const stripe = getStripeClient();
  const customerId = await ensureStripeCustomer(user);

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    allow_promotion_codes: true,
    subscription_data: {
      metadata: { userId: String(user._id), planId, billingCycle: cycle },
    },
    metadata: { userId: String(user._id), planId, billingCycle: cycle },
  });

  return session;
};

/**
 * Creates a Stripe Billing Portal session so the user can manage their
 * payment method, invoices, and cancellation from Stripe's hosted UI.
 */
export const createBillingPortalSession = async ({ user, returnUrl }) => {
  if (user.lifetimeAccess) {
    throw new Error('Lifetime-access accounts do not have a billing portal.');
  }
  if (!user.stripeCustomerId) {
    throw new Error('This account has no billing history yet.');
  }

  const stripe = getStripeClient();
  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: returnUrl,
  });

  return session;
};

/**
 * Pulls the plan/billingCycle/currentPeriod fields off a Stripe Subscription
 * object and writes them onto the Mongo user. Never touches lifetime users.
 */
export const syncSubscriptionToUser = async ({ user, subscription }) => {
  if (!user || user.lifetimeAccess) return user;

  const item = subscription.items?.data?.[0];
  const priceId = item?.price?.id || null;
  const match = getPlanByPriceId(priceId);

  user.stripeSubscriptionId = subscription.id;
  user.stripeCustomerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id || user.stripeCustomerId;
  user.stripePriceId = priceId;
  user.subscriptionStatus = subscription.status;
  user.subscriptionPlan = match?.plan?.id || user.subscriptionPlan || null;
  user.billingCycle = match?.billingCycle || user.billingCycle || null;
  user.cancelAtPeriodEnd = Boolean(subscription.cancel_at_period_end);
  user.currentPeriodStart = item?.current_period_start
    ? new Date(item.current_period_start * 1000)
    : (subscription.current_period_start ? new Date(subscription.current_period_start * 1000) : user.currentPeriodStart);
  user.currentPeriodEnd = item?.current_period_end
    ? new Date(item.current_period_end * 1000)
    : (subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : user.currentPeriodEnd);

  await user.save();
  await invalidateAuthCache(user._id);
  return user;
};

/**
 * Marks a user's subscription as canceled/ended without deleting any of the
 * historical Stripe identifiers (so re-subscribing later reuses the same
 * Stripe customer).
 */
export const markSubscriptionEnded = async (user) => {
  if (!user || user.lifetimeAccess) return user;
  user.subscriptionStatus = 'canceled';
  user.cancelAtPeriodEnd = false;
  await user.save();
  await invalidateAuthCache(user._id);
  return user;
};

/**
 * Finds the Mongo user associated with a Stripe object, preferring the
 * userId we stamped into metadata, and falling back to stripeCustomerId.
 */
export const findUserForStripeObject = async (stripeObject) => {
  const metadataUserId = stripeObject?.metadata?.userId || stripeObject?.subscription_data?.metadata?.userId;
  if (metadataUserId) {
    const user = await User.findById(metadataUserId);
    if (user) return user;
  }

  const customerId = typeof stripeObject?.customer === 'string' ? stripeObject.customer : stripeObject?.customer?.id;
  if (customerId) {
    const user = await User.findOne({ stripeCustomerId: customerId });
    if (user) return user;
  }

  return null;
};

export default {
  getStripeClient,
  ensureStripeCustomer,
  createCheckoutSession,
  createBillingPortalSession,
  syncSubscriptionToUser,
  markSubscriptionEnded,
  findUserForStripeObject,
};
