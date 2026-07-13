import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { getApiBaseUrl } from '../api/client'
import { useAuth } from './AuthContext'

/**
 * Real-time employee lifecycle/location events from the backend
 * (see backend/src/services/socket.service.js for the emitted event names).
 *
 * This is purely additive plumbing: it does not render anything and does
 * not touch any existing page/component. Any page can opt in later with
 * `useSocket()` to get live updates (e.g. re-fetch the employee list when
 * `employee:checked_in` fires) without changing how it looks.
 *
 * Events emitted by the backend, forwarded here as-is:
 *   employee:assigned, employee:unassigned, employee:checked_in,
 *   employee:started_work, employee:stopped_work, employee:site_finished,
 *   employee:leave_started, employee:leave_ended, employee:location_update
 */

const SocketContext = createContext({
  socket: null,
  connected: false,
  requestEmployeeLocation: () => {},
})

export const useSocket = () => useContext(SocketContext)

export const SocketProvider = ({ children }) => {
  const { token, isAuthenticated } = useAuth()
  const [connected, setConnected] = useState(false)
  const socketRef = useRef(null)

  useEffect(() => {
    if (!isAuthenticated || !token) {
      if (socketRef.current) {
        socketRef.current.disconnect()
        socketRef.current = null
        setConnected(false)
      }
      return
    }

    const socket = io(getApiBaseUrl(), {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
    })

    socket.on('connect', () => {
      setConnected(true)
      console.log('[socket] connected, id:', socket.id)
    })
    socket.on('disconnect', () => setConnected(false))
    socket.on('connect_error', (err) => {
      // Non-fatal: dashboard keeps working over plain REST if sockets fail.
      console.warn('[socket] connection error', err?.message)
    })

    socketRef.current = socket

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [isAuthenticated, token])

  const requestEmployeeLocation = (employeeId) => {
    socketRef.current?.emit('location:request', { employeeId })
  }

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, connected, requestEmployeeLocation }}>
      {children}
    </SocketContext.Provider>
  )
}

export default SocketContext
