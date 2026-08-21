import { useQuery } from '@tanstack/react-query'
import { invoicesApi } from '../api/invoices'
import { queryKeys } from '../queryKeys'
import { normalizeListResponse } from '../utils/apiResponseNormalizer'

export const useTaxInvoices = (month) =>
  useQuery({
    queryKey: queryKeys.invoices.list({ month }),
    queryFn: async () => normalizeListResponse(await invoicesApi.getInvoices({ month })).items,
  })
