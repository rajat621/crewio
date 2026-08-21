import { useQuery } from '@tanstack/react-query'
import { subscriptionApi } from '../api/subscription'
import { queryKeys } from '../queryKeys'

// Preserves the original's exact non-fatal-error behavior: a failed fetch
// here never surfaces as a page error, just leaves billingStatus null
// (the Billing card shows a generic fallback) - matches the original's
// empty catch that only console.error'd, no setError call.
export const useBillingStatus = () =>
  useQuery({
    queryKey: queryKeys.subscription.status(),
    queryFn: async () => {
      try {
        const { data } = await subscriptionApi.getStatus();
        return data;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Failed to load billing status:', err);
        throw err;
      }
    },
    retry: false,
  })
