import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '../api/dashboard';
import { queryKeys } from '../queryKeys';

const EMPTY_FINANCE = {
  period: null,
  totals: { totalRevenue: 0, totalExpenses: 0, vatCollected: 0, netProfit: 0 },
  trend: [],
  companies: [],
  moneyMade: [],
  investmentSummary: { totalLaborInvestment: 0, recoveredInvestment: 0, netProfit: 0 },
};

// `period` drives the server-side date range (see dashboard.controller.js's
// getFinancePeriodRange) - included in the query key so switching filters
// hits its own cache entry instead of showing stale data from a different
// period while refetching.
export const useFinanceData = (period = 'monthly') => {
  const query = useQuery({
    queryKey: queryKeys.dashboard.financeSummary(period),
    queryFn: async () => {
      const res = await dashboardApi.getFinanceSummary({ period });
      return res?.data?.data || null;
    },
    // Money Made / Investment Summary are returned in this same response
    // but are filter-independent server-side - keepPreviousData avoids a
    // visible flash of empty state in that half of the page while the
    // period-filtered half refetches.
    placeholderData: (previous) => previous,
  });

  return {
    data: query.data || EMPTY_FINANCE,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    refetch: query.refetch,
  };
};
