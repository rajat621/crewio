import { useQuery } from '@tanstack/react-query'
import { companiesApi } from '../api/companies'
import { queryKeys } from '../queryKeys'
import { normalizeListResponse } from '../utils/apiResponseNormalizer'

const ACTIVE_CLIENT_COMPANIES_PARAMS = { page: 1, limit: 500 }

// Extracted verbatim from Employees.jsx's loadCompanies - a lightweight
// dropdown source (active client companies only, mapped to {id, name}),
// not the same query as Company.jsx's own companies-with-stats fetch.
// Preserves the original's exact fallback chain: getClientCompanies()
// first, getCompanies() if that throws.
// Phase 3.12: optional `enabled` param (defaults to true, so every
// existing caller is unaffected) - added so AssignToCompanyDialog.jsx
// can gate this fetch on its own `open` state, preserving its original
// "only fetch when the dialog is actually opened" behavior exactly,
// rather than fetching unconditionally on mount.
export const useActiveClientCompanies = (enabled = true) => {
  return useQuery({
    queryKey: queryKeys.companies.list(ACTIVE_CLIENT_COMPANIES_PARAMS),
    enabled,
    queryFn: async () => {
      let rows;
      try {
        rows = normalizeListResponse(await companiesApi.getClientCompanies(ACTIVE_CLIENT_COMPANIES_PARAMS)).items;
      } catch {
        rows = normalizeListResponse(await companiesApi.getCompanies(ACTIVE_CLIENT_COMPANIES_PARAMS)).items;
      }

      return rows
        .filter(
          (company) =>
            (company?.companyRole || 'client') === 'client' &&
            String(company?.status || 'active').toLowerCase() === 'active'
        )
        .map((company) => ({
          id: company?._id,
          name: company?.name || 'Unnamed company',
        }))
        .filter((company) => company.id);
    },
  })
}
