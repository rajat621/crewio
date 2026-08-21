import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { CircularProgress, Box } from '@mui/material'

// Guards the /subscription route specifically. Unlike ProtectedRoute, this
// does NOT require an active subscription (that would create a redirect
// loop) - it only requires the user to be logged in, and explicitly blocks
// lifetime-access accounts, who must never see this page at all.
export const SubscriptionRoute = ({ children }) => {
  const { isAuthenticated, isLoading, user } = useAuth()

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/signin" replace />
  }

  if (user?.lifetimeAccess) {
    return <Navigate to="/" replace />
  }

  return children
}

export default SubscriptionRoute
