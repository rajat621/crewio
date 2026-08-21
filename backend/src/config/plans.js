// Centralized subscription plan configuration.
//
// This is the single source of truth for which plans exist, whether they are
// purchasable yet, and which Stripe Price IDs back them. The frontend renders
// its plan cards from the `enabled` flag returned by GET /api/subscription/plans
// (see subscription.controller.js) so enabling Pro/Ultra later is a config
// change here, not a UI rewrite.

export const BILLING_INTERVALS = {
  MONTHLY: 'monthly',
  YEARLY: 'yearly',
};

export const PLAN_IDS = {
  PLUS: 'plus',
  PRO: 'pro',
  ULTRA: 'ultra',
};

// Plans are ordered for display purposes.
export const PLANS = [
  {
    id: PLAN_IDS.PLUS,
    name: 'Crewio Plus',
    enabled: true,
    stripeMonthlyPriceId: process.env.STRIPE_PLUS_MONTHLY_PRICE_ID || '',
    stripeYearlyPriceId: process.env.STRIPE_PLUS_YEARLY_PRICE_ID || '',
    billingIntervals: [BILLING_INTERVALS.MONTHLY, BILLING_INTERVALS.YEARLY],
    displayPrice: {
      monthly: 199,
      yearly: 2268,
    },
    displayOldPrice: {
      monthly: 299,
      yearly: 3588,
    },
    features: [
      'Employee Management',
      'Real-Time Attendance Tracking',
      'Mobile Workforce App',
      'Manual Salary Slip Generator',
      'AI VAT Invoice Generator',
      'Attendance & Payroll Reports',
      'Team Chat & Push Notifications',
      'Secure Cloud Storage',
    ],
  },
  {
    id: PLAN_IDS.PRO,
    name: 'Crewio Pro',
    enabled: false,
    stripeMonthlyPriceId: process.env.STRIPE_PRO_MONTHLY_PRICE_ID || '',
    stripeYearlyPriceId: process.env.STRIPE_PRO_YEARLY_PRICE_ID || '',
    billingIntervals: [BILLING_INTERVALS.MONTHLY, BILLING_INTERVALS.YEARLY],
    displayPrice: { monthly: null, yearly: null },
    displayOldPrice: { monthly: null, yearly: null },
    features: [],
  },
  {
    id: PLAN_IDS.ULTRA,
    name: 'Crewio Ultra',
    enabled: false,
    stripeMonthlyPriceId: process.env.STRIPE_ULTRA_MONTHLY_PRICE_ID || '',
    stripeYearlyPriceId: process.env.STRIPE_ULTRA_YEARLY_PRICE_ID || '',
    billingIntervals: [BILLING_INTERVALS.MONTHLY, BILLING_INTERVALS.YEARLY],
    displayPrice: { monthly: null, yearly: null },
    displayOldPrice: { monthly: null, yearly: null },
    features: [],
  },
];

export const getPlanById = (planId) => PLANS.find((p) => p.id === planId) || null;

export const getEnabledPlans = () => PLANS.filter((p) => p.enabled);

export const getPriceIdForPlan = (planId, billingCycle) => {
  const plan = getPlanById(planId);
  if (!plan) return null;
  if (billingCycle === BILLING_INTERVALS.YEARLY) return plan.stripeYearlyPriceId || null;
  return plan.stripeMonthlyPriceId || null;
};

// Reverse lookup: given a Stripe Price ID (from a webhook payload), find the
// plan + billing cycle it corresponds to. Used to keep MongoDB in sync with
// whatever the customer actually subscribed to on Stripe's side.
export const getPlanByPriceId = (priceId) => {
  if (!priceId) return null;
  for (const plan of PLANS) {
    if (plan.stripeMonthlyPriceId && plan.stripeMonthlyPriceId === priceId) {
      return { plan, billingCycle: BILLING_INTERVALS.MONTHLY };
    }
    if (plan.stripeYearlyPriceId && plan.stripeYearlyPriceId === priceId) {
      return { plan, billingCycle: BILLING_INTERVALS.YEARLY };
    }
  }
  return null;
};

export default PLANS;
