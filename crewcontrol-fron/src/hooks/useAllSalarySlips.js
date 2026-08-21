import { useQuery } from '@tanstack/react-query'
import { salarySlipsApi } from '../api/salarySlips'
import { queryKeys } from '../queryKeys'

// Returns the raw slips array - GenerateSalarySlip.jsx computes the next
// slip number from it (same max+1 logic as the original), and
// handleGenerate's duplicate-check calls refetch() on this same query for
// a fresh read right before submitting, rather than trusting whatever was
// cached at mount time - same "want the freshest data at the moment of a
// write" reasoning already applied to InvoicePreviewWindow.jsx's save
// mutation.
// Extracted so useDashboardData.js (which shares this exact query key -
// both pages show "all salary slips", genuinely the same data) can use
// the identical parsing logic instead of its own separately-written
// version. Found during this migration's final duplicate-query audit:
// the two had diverged slightly (useDashboardData.js's inline version
// was missing the response?.data?.data fallback below), which is a real
// correctness risk when two queryFns share one cache key - whichever
// hook's query actually executes first determines what's cached, so a
// less-robust parser could silently under-serve the other page.
export const parseAllSalarySlipsResponse = (response) =>
  response?.data?.salarySlips || response?.data?.data || [];

export const useAllSalarySlips = () =>
  useQuery({
    queryKey: queryKeys.salary.list({}),
    queryFn: async () => {
      const response = await salarySlipsApi.listSalarySlips();
      return parseAllSalarySlipsResponse(response);
    },
  })
