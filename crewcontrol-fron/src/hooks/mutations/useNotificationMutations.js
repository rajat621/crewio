import { useApiMutation } from './useApiMutation'
import { notificationsApi } from '../../api/notifications'
import { OWNER_NOTIFICATIONS_KEY } from '../useNotifications'

// Same optimistic-patch/rollback pattern as useEmployeeMutations.js -
// snapshot the previous cached list, apply the change in place, return
// the snapshot for rollback on failure.
const getPrevious = (queryClient) => queryClient.getQueryData(OWNER_NOTIFICATIONS_KEY)
const rollback = (queryClient, previous) => {
  if (previous !== undefined) queryClient.setQueryData(OWNER_NOTIFICATIONS_KEY, previous)
}

// --- Mark one read ---------------------------------------------------
// Read status is explicitly listed as safe for optimistic updates in
// OPTIMISTIC_UPDATES.md - trivially reversible, no side effects if it
// fails beyond the badge count/read-dot being briefly wrong.
export const useMarkNotificationReadMutation = () =>
  useApiMutation({
    mutationFn: (id) => notificationsApi.markRead(id),
    invalidateKeys: [OWNER_NOTIFICATIONS_KEY],
    invalidateTiming: 'settled',
    optimisticUpdate: (queryClient, id) => {
      const previous = getPrevious(queryClient)
      if (!Array.isArray(previous)) return undefined
      queryClient.setQueryData(
        OWNER_NOTIFICATIONS_KEY,
        previous.map((n) => (String(n?._id) === String(id) ? { ...n, read: true } : n))
      )
      return previous
    },
    rollback,
  })

// --- Mark all read -----------------------------------------------------
// Same safety reasoning as above, applied to every cached item at once.
// Previously implemented client-side as N individual markRead() calls
// (one per unread notification) with an immediate optimistic
// mark-all-unread-as-read on the local component state, no rollback if
// any of the N calls failed. Now: one bulk API call
// (markAllOwnerNotificationsRead - see api/notifications.js), optimistic
// update over the shared cache, and a real rollback if the single bulk
// call fails (an improvement over the original's silent per-item
// .catch(() => {}), which is preserved in spirit by keeping the toast
// UI-agnostic - see onToast below - not forced on this migration).
export const useMarkAllNotificationsReadMutation = () =>
  useApiMutation({
    mutationFn: () => notificationsApi.markAllOwnerNotificationsRead(),
    invalidateKeys: [OWNER_NOTIFICATIONS_KEY],
    invalidateTiming: 'settled',
    optimisticUpdate: (queryClient) => {
      const previous = getPrevious(queryClient)
      if (!Array.isArray(previous)) return undefined
      queryClient.setQueryData(OWNER_NOTIFICATIONS_KEY, previous.map((n) => ({ ...n, read: true })))
      return previous
    },
    rollback,
  })

// --- Delete all ---------------------------------------------------------
// NOT in OPTIMISTIC_UPDATES.md's safe list explicitly, but this mirrors
// exactly what NotificationPopover.jsx's original deleteAll() already did
// by hand: clear the list immediately, restore it if the request fails
// ("so the person isn't misled into thinking it worked when it didn't" -
// the original code's own comment). Reproducing that exact behavior
// through useApiMutation's optimistic/rollback, not introducing a new
// policy.
export const useDeleteAllNotificationsMutation = () =>
  useApiMutation({
    mutationFn: () => notificationsApi.deleteAllOwnerNotifications(),
    invalidateKeys: [OWNER_NOTIFICATIONS_KEY],
    invalidateTiming: 'settled',
    optimisticUpdate: (queryClient) => {
      const previous = getPrevious(queryClient)
      queryClient.setQueryData(OWNER_NOTIFICATIONS_KEY, [])
      return previous
    },
    rollback,
  })
