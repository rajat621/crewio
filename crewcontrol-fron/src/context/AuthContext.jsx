import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react'
import { authApi } from '../api/auth'
import { queryClient } from '../queryClient'
import { queryKeys } from '../queryKeys'

// Shared by every call site that needs the current user from
// GET /api/auth/me (this file's session-restore effect, refreshUser(), and
// useMe.js) - routed through the SAME React Query cache/key so concurrent
// callers on the same page load (e.g. AuthContext's mount effect and a
// component mounting useMe() at the same time) dedupe into one request
// instead of firing it twice. This endpoint does a populated Mongo lookup
// on every call, so a duplicate here was a real, measured cost, not just
// a wasted round trip.
const fetchMe = () => queryClient.fetchQuery({ queryKey: queryKeys.auth.me(), queryFn: async () => {
  const response = await authApi.getMe()
  return response?.data?.user || null
} })

const AuthContext = createContext()

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  // On mount, try to restore session from localStorage
  useEffect(() => {
    const restoreSession = () => {
      try {
        const savedToken = localStorage.getItem('crewcontrol_token')
        const savedUser = localStorage.getItem('crewcontrol_user')

        if (savedToken && savedUser) {
          setToken(savedToken)
          // normalize stored user to ensure companyId exists
          const parsed = JSON.parse(savedUser)
          const storedCompanyId = parsed.companyId || (parsed.company && (parsed.company._id || parsed.company.id || parsed.company)) || null
          const normalizedStoredUser = { ...parsed, companyId: storedCompanyId }
          setUser(normalizedStoredUser)
          setIsAuthenticated(true)

          // Everything above is synchronous (localStorage read only) -
          // isLoading drops to false here, BEFORE the network validation
          // below resolves, so ProtectedRoute renders the page (and its
          // data queries start firing) immediately instead of waiting on
          // GET /api/auth/me first. This used to gate the entire Home
          // critical path behind that one call (measured 650-900ms) even
          // though it doesn't grant any access itself - every API call the
          // page then makes is independently re-validated server-side by
          // authenticateToken anyway, so an invalid/expired token can't
          // silently succeed here; it just fails those calls (and the
          // catch below still logs the user out once validation returns).
          setIsLoading(false)

          // Background validation: refreshes the cached user object (and
          // logs out if the token turns out to be invalid/expired) without
          // blocking the initial render on it.
          fetchMe()
            .then((u) => {
              if (u) {
                const resolvedCompanyId = u.companyId || (u.company && (u.company._id || u.company.id || u.company)) || null
                const normalizedUser = { ...u, companyId: resolvedCompanyId }
                setUser(normalizedUser)
                localStorage.setItem('crewcontrol_user', JSON.stringify(normalizedUser))
              }
            })
            .catch(() => {
              // Token invalid, clear it
              localStorage.removeItem('crewcontrol_token')
              localStorage.removeItem('crewcontrol_user')
              setToken(null)
              setUser(null)
              setIsAuthenticated(false)
            })
        } else {
          setIsLoading(false)
        }
      } catch (error) {
        console.error('Error restoring session:', error)
        setIsLoading(false)
      }
    }

    restoreSession()
  }, [])

  const login = useCallback((newToken, newUser) => {
    // normalize newUser to ensure companyId is present
    const u = newUser || {}
    const resolvedCompanyId = u.companyId || (u.company && (u.company._id || u.company.id || u.company)) || null
    const normalizedUser = { ...u, companyId: resolvedCompanyId }
    setToken(newToken)
    setUser(normalizedUser)
    setIsAuthenticated(true)
    localStorage.setItem('crewcontrol_token', newToken)
    localStorage.setItem('crewcontrol_user', JSON.stringify(normalizedUser))
  }, [])

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
    setIsAuthenticated(false)
    localStorage.removeItem('crewcontrol_token')
    localStorage.removeItem('crewcontrol_user')
    queryClient.clear()
  }, [])

  const updateUser = useCallback((updatedUser) => {
    // normalize updated user as well
    const u = updatedUser || {}
    const resolvedCompanyId = u.companyId || (u.company && (u.company._id || u.company.id || u.company)) || null
    const normalizedUser = { ...u, companyId: resolvedCompanyId }
    setUser(normalizedUser)
    localStorage.setItem('crewcontrol_user', JSON.stringify(normalizedUser))
  }, [])

  // Re-fetches the current user from the backend and merges the result in.
  // Used after returning from Stripe Checkout / the Billing Portal, where the
  // locally-cached user object is stale until the webhook (or this refetch)
  // catches up.
  const refreshUser = useCallback(async () => {
    try {
      const response = await authApi.getMe()
      if (response?.data?.user) {
        updateUser(response.data.user)
        return response.data.user
      }
    } catch (error) {
      // Non-fatal: caller keeps whatever it already had.
      console.error('Failed to refresh user:', error)
    }
    return null
  }, [updateUser])

  // True for lifetime accounts and accounts with an active/trialing Stripe
  // subscription. Mirrors the backend's User.hasActiveAccess() so
  // route-guarding logic stays in one conceptual place.
  const hasActiveAccess = Boolean(
    user && (user.lifetimeAccess || user.hasActiveAccess || ['active', 'trialing'].includes(user.subscriptionStatus))
  )

  // Memoized so every useAuth() consumer across the app - every page
  // migrated this session reads this - only re-renders when one of these
  // values actually changes, not whenever AuthProvider re-renders for any
  // reason (e.g. a state update unrelated to what a given consumer reads).
  // Pure reference-stability change: the data and behavior are identical.
  const value = useMemo(
    () => ({
      user,
      token,
      isAuthenticated,
      isLoading,
      login,
      logout,
      updateUser,
      refreshUser,
      hasActiveAccess,
    }),
    [user, token, isAuthenticated, isLoading, login, logout, updateUser, refreshUser, hasActiveAccess]
  )

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
