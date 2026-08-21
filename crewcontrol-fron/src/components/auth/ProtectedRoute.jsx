import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { CircularProgress, Box } from '@mui/material'

export const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, isLoading, hasActiveAccess } = useAuth()

  if (isLoading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="100vh"
      >
        <CircularProgress />
      </Box>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />
  }

  // Rule: lifetimeAccess === true OR subscriptionStatus === active/trialing
  // is allowed in; everyone else gets bounced to the subscription page, even
  // if they type a protected URL directly.
  if (!hasActiveAccess) {
    return <Navigate to="/subscription" replace />
  }

  return children
}
