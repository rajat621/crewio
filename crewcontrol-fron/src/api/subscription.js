import api from './client'

export const subscriptionApi = {
  // getPlans removed (dead code cleanup) - zero usage anywhere in the
  // frontend, including Subscription.jsx (the most likely consumer),
  // which only calls getStatus below.

  // Current user's subscription snapshot: lifetimeAccess, subscriptionPlan,
  // subscriptionStatus, hasActiveAccess, etc.
  getStatus: () => api.get('/api/subscription/status'),

  // Starts a Stripe Checkout session and returns { url, sessionId }.
  createCheckoutSession: (planId, billingCycle) =>
    api.post('/api/subscription/checkout-session', {
      planId,
      billingCycle,
      frontend: typeof window !== 'undefined' ? window.location.origin : undefined,
    }),

  // Opens the Stripe Billing Portal and returns { url }.
  createPortalSession: () =>
    api.post('/api/subscription/portal-session', {
      frontend: typeof window !== 'undefined' ? window.location.origin : undefined,
    }),
}

export default subscriptionApi
