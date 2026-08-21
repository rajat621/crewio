import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useSocket } from '../context/SocketContext'
import { applySocketEvent } from '../sockets/socketBridge'

// Subscribes a fixed list of socket events to the shared socket bridge.
// Extracted after this exact pattern (register N events, each dispatching
// through applySocketEvent, clean up on unmount) appeared independently
// in Employees.jsx and useNotifications.js - a third near-identical copy
// for the dashboard was the trigger to consolidate it instead of copying
// it again.
//
// IMPORTANT: `events` must be a referentially-stable array (a module-level
// constant, not an inline literal at the call site) - it's an effect
// dependency, and a new array reference every render would cause a
// resubscribe every render instead of once.
export const useSocketBridge = (events) => {
  const { socket } = useSocket()
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!socket || !events?.length) return
    const handlers = events.map((event) => {
      const handler = (payload) => applySocketEvent(queryClient, event, payload)
      socket.on(event, handler)
      return { event, handler }
    })
    return () => handlers.forEach(({ event, handler }) => socket.off(event, handler))
  }, [socket, queryClient, events])
}
