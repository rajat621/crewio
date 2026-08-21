import { useApiMutation } from './useApiMutation'
import { authApi } from '../../api/auth'
import { subscriptionApi } from '../../api/subscription'
import { queryKeys } from '../../queryKeys'

// None of these are optimistic - password change, 2FA, and account
// deletion are all authentication-adjacent, explicitly on
// OPTIMISTIC_UPDATES.md's unsafe list ("there is no safe optimistic
// login" extends directly to these). Every one waits for the real
// response before the UI reflects anything.

export const useChangePasswordMutation = () =>
  useApiMutation({
    mutationFn: (payload) => authApi.changePassword(payload),
  })

export const useSetupTwoFactorMutation = () =>
  useApiMutation({
    mutationFn: () => authApi.setupTwoFactor(),
  })

export const useVerifyTwoFactorMutation = () =>
  useApiMutation({
    mutationFn: (code) => authApi.verifyTwoFactor(code),
    invalidateKeys: [queryKeys.auth.me()],
    invalidateTiming: 'settled',
  })

export const useDisableTwoFactorMutation = () =>
  useApiMutation({
    mutationFn: () => authApi.disableTwoFactor(),
    invalidateKeys: [queryKeys.auth.me()],
    invalidateTiming: 'settled',
  })

export const useDeleteAccountMutation = () =>
  useApiMutation({
    mutationFn: (password) => authApi.deleteAccount(password),
    // No cache invalidation - the user is logged out and redirected
    // immediately on success, matching the original.
  })

export const useManageBillingMutation = () =>
  useApiMutation({
    mutationFn: () => subscriptionApi.createPortalSession(),
    // No cache invalidation - this redirects the whole page via
    // window.location.href on success (see AccountSecurity.jsx), so
    // there's nothing left to invalidate client-side.
  })
