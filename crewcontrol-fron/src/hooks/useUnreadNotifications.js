import { useNotifications } from './useNotifications'

/**
 * Live unread-notification count for the topbar bell badge.
 *
 * Previously fetched the full notification list independently (with its
 * own copy of the lifecycle-event socket listeners) purely to count
 * unread items - now derives the count from useNotifications()'s shared
 * cache instead, so opening the bell popover and showing the badge count
 * are backed by one fetch, not two. External shape ({count, refresh})
 * unchanged - Topbar.jsx needs no changes.
 */
function useUnreadNotifications() {
  const { data: notifications = [], refetch } = useNotifications()
  const count = notifications.filter((n) => !n.read).length
  return { count, refresh: refetch }
}

export default useUnreadNotifications

