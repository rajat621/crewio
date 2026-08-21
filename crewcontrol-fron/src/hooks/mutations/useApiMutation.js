import { useMutation, useQueryClient } from '@tanstack/react-query'
import { normalizeError } from '../../utils/apiResponseNormalizer'

// Reusable mutation infrastructure (Step 4). NOT wired into any page in
// this task - these are the building blocks future page migrations will
// use, verified to compile and behave correctly in isolation.
//
// Every mutation created through these helpers already supports:
//  - automatic invalidation (invalidateKeys)
//  - optimistic updates + rollback (optimisticUpdate/rollback), opt-in only
//  - retry policy (defaults to 0 - see CACHE_STRATEGY.md's retry section)
//  - success/error callbacks, including an optional toast callback - these
//    helpers stay UI-agnostic (no Snackbar/toast system exists centrally
//    in this codebase today - each page manages its own, e.g.
//    SalarySlip.jsx/Expenses.jsx), so `onToast` is just a plain callback
//    the calling component wires into whatever local feedback mechanism
//    it already has, not something this file renders itself.

/**
 * @param {object} config
 * @param {Function} config.mutationFn - the api/*.js call to perform
 * @param {Array|Array[]} [config.invalidateKeys] - query key(s) to invalidate on success
 * @param {Function} [config.optimisticUpdate] - (queryClient, variables) => previousDataSnapshot; applies the optimistic change via queryClient.setQueryData and returns whatever's needed to roll back
 * @param {Function} [config.rollback] - (queryClient, snapshot) => void; undoes optimisticUpdate on failure
 * @param {number} [config.retry] - defaults to 0 (see CACHE_STRATEGY.md - most writes aren't safe to retry blindly)
 * @param {'settled'|'success'} [config.invalidateTiming] - 'settled' (default) invalidates whether the mutation succeeded or failed - matches most existing manual-refetch patterns. 'success' only invalidates on success, for mutations where a failed request should leave the cache/UI exactly as it was before (verify against the specific mutation's existing behavior, not assumed).
 * @param {Function} [config.onToast] - (type: 'success'|'error', message: string) => void
 * @param {Function} [config.onSuccess]
 * @param {Function} [config.onError]
 */
export const useApiMutation = ({
  mutationFn,
  invalidateKeys = [],
  optimisticUpdate,
  rollback,
  retry = 0,
  invalidateTiming = 'settled',
  onToast,
  onSuccess,
  onError,
} = {}) => {
  const queryClient = useQueryClient()
  const invalidate = () => invalidateKeys.forEach((key) => queryClient.invalidateQueries({ queryKey: key }))

  return useMutation({
    mutationFn,
    retry,
    onMutate: optimisticUpdate
      ? async (variables) => {
          // Cancel any in-flight refetch for the keys we're about to
          // optimistically edit, so it can't overwrite our optimistic
          // value with stale data arriving after the mutation started.
          await Promise.all(invalidateKeys.map((key) => queryClient.cancelQueries({ queryKey: key })))
          return optimisticUpdate(queryClient, variables)
        }
      : undefined,
    onError: (error, variables, snapshot) => {
      if (rollback && snapshot !== undefined) rollback(queryClient, snapshot)
      const normalized = normalizeError(error)
      onToast?.('error', normalized.message)
      onError?.(normalized, variables)
    },
    onSuccess: (data, variables) => {
      // `data` is the raw axios response (api/*.js modules return it
      // unwrapped - verified against api/employees.js) - the backend's
      // message field lives at data.data.message, not data.message.
      // Confirmed via audit: this previously always passed `undefined` to
      // onToast, silently.
      onToast?.('success', data?.data?.message)
      onSuccess?.(data, variables)
      if (invalidateTiming === 'success') invalidate()
    },
    onSettled: () => {
      if (invalidateTiming === 'settled') invalidate()
    },
  })
}

// Thin, named wrappers over useApiMutation for the common cases (Step 4's
// createMutation/updateMutation/deleteMutation/uploadMutation) - these
// don't add behavior beyond useApiMutation, they exist so a future page
// migration reads intent from the hook name rather than re-deriving it
// from a generic call's config every time.

export const useCreateMutation = (config) => useApiMutation(config)
export const useUpdateMutation = (config) => useApiMutation(config)
export const useDeleteMutation = (config) => useApiMutation(config)

// Uploads default retry: 0 (same as everything else) but callers commonly
// need upload progress, which plain useMutation doesn't expose - config.
// onUploadProgress is passed straight through to the api/*.js call's axios
// config, since client.js/employees.js etc. already accept one.
export const useUploadMutation = (config) => useApiMutation({ ...config, retry: 0 })
