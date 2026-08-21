import { useQuery } from '@tanstack/react-query'
import { companiesApi } from '../api/companies'
import { queryKeys } from '../queryKeys'
import { normalizeItemResponse } from '../utils/apiResponseNormalizer'
import { useApiMutation } from './mutations/useApiMutation'

// getOwnerCompany() throwing (no owner company yet) is a valid state
// during first-time onboarding, not an error to surface - matches the
// original's empty catch block. React Query still puts the query in an
// error state internally; the page reads `data` (undefined on error) the
// same way it always checked `if (!company) return`.
//
// includeAssets defaults to false (lightweight metadata + hasLogo/
// hasStamp/hasSignature/hasInvoiceTemplate booleans only) - pass true only
// from a page that genuinely displays/edits the actual logo/stamp/
// signature/invoiceTemplate bytes (CompanyProfile, OnboardingCompanyProfile).
// Different query keys per variant since they're genuinely different
// response shapes, not just a param on an otherwise-identical fetch.
export const useOwnerCompany = (includeAssets = false) =>
  useQuery({
    queryKey: queryKeys.companies.detail(includeAssets ? 'owner-full' : 'owner'),
    queryFn: async () => normalizeItemResponse(await companiesApi.getOwnerCompany(includeAssets)).item,
    retry: false,
  })

// Fetches one asset field's raw bytes and hands back a `data:` URI - the
// same shape the field used to arrive in inline via getOwnerCompany's full
// response, so call sites that embed it (client-side jsPDF logo embed)
// don't need to change how they consume the value, only where it comes
// from. Returns null when the asset doesn't exist (404) rather than
// throwing, since "no logo yet" is a normal state, not an error.
export const useOwnerCompanyAsset = (field, enabled = true) =>
  useQuery({
    queryKey: queryKeys.companies.detail(`owner-asset-${field}`),
    queryFn: async () => {
      try {
        const response = await companiesApi.getOwnerCompanyAsset(field);
        const blob = response.data;
        return await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } catch (error) {
        if (error?.response?.status === 404) return null;
        throw error;
      }
    },
    enabled: Boolean(field) && enabled,
    retry: false,
  })

export const useUpdateOwnerCompanyMutation = () =>
  useApiMutation({
    mutationFn: (payload) => companiesApi.updateOwnerCompany(payload),
    invalidateKeys: [queryKeys.companies.detail('owner')],
    invalidateTiming: 'settled',
  })
