import { useQuery } from '@tanstack/react-query'
import { companiesApi } from '../api/companies'
import { queryKeys } from '../queryKeys'
import { normalizeItemResponse } from '../utils/apiResponseNormalizer'
import { isCompanyProfileComplete } from '../utils/companyProfileStatus'

// Preserves the original's exact behavior, including its debug
// console.log (not cleaned up here - not dead/unreachable code, just
// noisy, and this migration's scope is fetching mechanics, not cleanup
// beyond dead code).
export const useShowCompanyWarning = (companyId) => {
  const query = useQuery({
    queryKey: queryKeys.companies.detail(companyId),
    queryFn: async () => normalizeItemResponse(await companiesApi.getCompany(companyId)).item,
    enabled: Boolean(companyId),
  });

  if (!companyId) return true;
  if (query.isError) return true;
  if (query.isLoading) return false; // original defaulted showCompanyWarning to false until resolved
  const company = query.data;
  // eslint-disable-next-line no-console
  console.log('loadCompanyStatus - fetched company:', company, 'isComplete:', isCompanyProfileComplete(company));
  return !isCompanyProfileComplete(company);
};
