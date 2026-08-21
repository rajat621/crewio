import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { notificationsApi } from '../api/notifications'
import { queryKeys } from '../queryKeys'
import { normalizeListResponse } from '../utils/apiResponseNormalizer'
import { cacheConfig } from '../config/cacheConfig'
import { applySocketEvent, allMappedEvents } from '../sockets/socketBridge'
import { useSocket } from '../context/SocketContext'

export const OWNER_NOTIFICATIONS_KEY = queryKeys.notifications.list({ scope: 'owner' })

// Single shared query for the owner's notification list. Previously,
// NotificationPopover.jsx and useUnreadNotifications.js each
// independently called notificationsApi.listOwnerNotifications() and
// maintained their own copy of the exact same LIFECYCLE_EVENTS
// socket-listening code - real, measurable duplication (two network
// requests for identical data, two copies of the same 8-event
// socket.on/off block). This hook is now the one place both consumers
// read from; React Query's own caching means a second component calling
// this hook doesn't trigger a second fetch.
export const useNotifications = () => {
  const queryClient = useQueryClient()
  const { socket } = useSocket()

  const query = useQuery({
    queryKey: OWNER_NOTIFICATIONS_KEY,
    queryFn: async () => {
      const response = await notificationsApi.listOwnerNotifications()
      return normalizeListResponse(response).items
    },
    staleTime: cacheConfig.notifications.staleTime,
    gcTime: cacheConfig.notifications.gcTime,
  })

  // Every lifecycle event that used to be listened for independently in
  // both consumer files now goes through the shared socket bridge here,
  // once. socketBridge.js's mapping for these events already targets
  // queryKeys.notifications.all (a prefix of this hook's own list key),
  // so invalidating there refreshes this query too.
  useEffect(() => {
    if (!socket) return
    const relevantEvents = allMappedEvents.filter((event) => event.startsWith('employee:'))
    const handlers = relevantEvents.map((event) => {
      const handler = (payload) => applySocketEvent(queryClient, event, payload)
      socket.on(event, handler)
      return { event, handler }
    })
    return () => handlers.forEach(({ event, handler }) => socket.off(event, handler))
  }, [socket, queryClient])

  return query
}
