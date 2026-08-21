import { useApiMutation } from './useApiMutation'
import { subscriptionApi } from '../../api/subscription'

// Not optimistic - payment/checkout flow, explicitly on
// OPTIMISTIC_UPDATES.md's unsafe list. No cache invalidation - success
// redirects the whole page via window.location.href (see
// Subscription.jsx), so there's nothing left to invalidate client-side,
// same reasoning as useManageBillingMutation.
export const useCreateCheckoutSessionMutation = () =>
  useApiMutation({
    mutationFn: ({ planKey, billingCycle }) => subscriptionApi.createCheckoutSession(planKey, billingCycle),
  })
