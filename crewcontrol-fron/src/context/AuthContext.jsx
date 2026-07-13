import React, { createContext, useContext, useState, useEffect } from 'react'
import { authApi } from '../api/auth'

const AuthContext = createContext()

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  // On mount, try to restore session from localStorage
  useEffect(() => {
    const restoreSession = async () => {
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

          // Optionally validate token with backend
          try {
            const response = await authApi.getMe()
            if (response?.data?.user) {
              // normalize user object to always include companyId
              const u = response.data.user
              const resolvedCompanyId = u.companyId || (u.company && (u.company._id || u.company.id || u.company)) || null
              const normalizedUser = { ...u, companyId: resolvedCompanyId }
              setUser(normalizedUser)
              localStorage.setItem('crewcontrol_user', JSON.stringify(normalizedUser))
            }
          } catch (error) {
            // Token invalid, clear it
            localStorage.removeItem('crewcontrol_token')
            localStorage.removeItem('crewcontrol_user')
            setToken(null)
            setUser(null)
            setIsAuthenticated(false)
          }
        }
      } catch (error) {
        console.error('Error restoring session:', error)
      } finally {
        setIsLoading(false)
      }
    }

    restoreSession()
  }, [])

  const login = (newToken, newUser) => {
    // normalize newUser to ensure companyId is present
    const u = newUser || {}
    const resolvedCompanyId = u.companyId || (u.company && (u.company._id || u.company.id || u.company)) || null
    const normalizedUser = { ...u, companyId: resolvedCompanyId }
    setToken(newToken)
    setUser(normalizedUser)
    setIsAuthenticated(true)
    localStorage.setItem('crewcontrol_token', newToken)
    localStorage.setItem('crewcontrol_user', JSON.stringify(normalizedUser))
  }

  const logout = () => {
    setToken(null)
    setUser(null)
    setIsAuthenticated(false)
    localStorage.removeItem('crewcontrol_token')
    localStorage.removeItem('crewcontrol_user')
  }

  const updateUser = (updatedUser) => {
    // normalize updated user as well
    const u = updatedUser || {}
    const resolvedCompanyId = u.companyId || (u.company && (u.company._id || u.company.id || u.company)) || null
    const normalizedUser = { ...u, companyId: resolvedCompanyId }
    setUser(normalizedUser)
    localStorage.setItem('crewcontrol_user', JSON.stringify(normalizedUser))
  }

  const value = {
    user,
    token,
    isAuthenticated,
    isLoading,
    login,
    logout,
    updateUser
  }

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
