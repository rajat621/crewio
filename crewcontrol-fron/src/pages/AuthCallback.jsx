import React, { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function AuthCallback() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [searchParams] = useSearchParams()

  useEffect(() => {
    const token = searchParams.get('token')
    const userStr = searchParams.get('user')
    const error = searchParams.get('error')

    if (error) {
      console.error('Authentication error:', error)
      const safeError = String(error || 'Google authentication failed')
      navigate('/signin?error=' + encodeURIComponent(safeError))
      return
    }

    if (token && userStr) {
      try {
        const user = JSON.parse(decodeURIComponent(userStr))
        login(token, user)
        navigate('/home')
      } catch (err) {
        console.error('Failed to parse auth data:', err)
        navigate('/signin?error=Authentication failed')
      }
    } else {
      navigate('/signin?error=Missing authentication data')
    }
  }, [searchParams, navigate, login])

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      backgroundColor: '#eceef8'
    }}>
      <div style={{ textAlign: 'center' }}>
        <p>Processing authentication...</p>
      </div>
    </div>
  )
}
