import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { authApi } from '../api/auth'
import { getApiBaseUrl } from '../api/client'
import '../styles/auth.css'
import logo from '../assets/crewio_logo.png'

export default function SignUp() {
  const navigate = useNavigate()
  
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  
  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }
  
  const handleSignUp = async (e) => {
    e.preventDefault()
    setError(null)
    
    if (!formData.firstName || !formData.lastName || !formData.email || !formData.password) {
      setError('Please fill in all required fields')
      return
    }
    
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match')
      return
    }
    
    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    
    try {
      setLoading(true)
      console.log('[auth-ui] signup.request', { email: formData.email })
      await authApi.signup({
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        password: formData.password
      })
      console.log('[auth-ui] signup.response.success', { email: formData.email })
      // Redirect to OTP verification
      navigate(`/verify-email?email=${encodeURIComponent(formData.email)}&flow=signup`)
    } catch (err) {
      console.error('[auth-ui] signup.response.error', {
        email: formData.email,
        status: err?.response?.status,
        message: err?.response?.data?.message || err?.message,
        error: err?.response?.data?.error,
      })
      setError(err.response?.data?.message || 'Sign up failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }
  
  return (
<div className="auth-wrapper signup-wrapper">      {/* LOGO */}
			<div className="brand">
        <img src={logo} alt="Crewio logo" />        
        </div>

      {/* CARD */}
      <div className="auth-card-signup">
        {/* HEADING */}
        <h2>Create your account</h2>

        {/* SUBHEADING */}
        <p className="subtitle">Just a few details to get you started.</p>

        {/* ERROR ALERT */}
        {error && (
          <div style={{ 
            backgroundColor: '#fee2e2', 
            color: '#dc2626', 
            padding: '10px', 
            borderRadius: '6px', 
            marginBottom: '20px',
            fontSize: '14px'
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSignUp}>
          {/* NAME FIELDS - SIDE BY SIDE */}
          <div className="form-row">
            <div>
              <div className="form-group">
                <label>First Name<span>*</span></label>
                <input
                  type="text"
                  name="firstName"
                  placeholder="Enter your First Name"
                  value={formData.firstName}
                  onChange={handleChange}
                  disabled={loading}
                />
              </div>
            </div>
            <div>
              <div className="form-group">
                <label>Last Name<span>*</span></label>
                <input
                  type="text"
                  name="lastName"
                  placeholder="Enter your Last Name"
                  value={formData.lastName}
                  onChange={handleChange}
                  disabled={loading}
                />
              </div>
            </div>
          </div>

          {/* EMAIL FIELD */}
          <div className="form-group">
            <label>Email<span>*</span></label>
            <input
              type="email"
              name="email"
              placeholder="Enter your Email"
              value={formData.email}
              onChange={handleChange}
              disabled={loading}
            />
          </div>

          {/* PASSWORD FIELD */}
          <div className="form-group">
            <label>Password<span>*</span></label>
            <input
              type="password"
              name="password"
              placeholder="Enter your password"
              value={formData.password}
              onChange={handleChange}
              disabled={loading}
            />
          </div>

          {/* CONFIRM PASSWORD FIELD */}
          <div className="form-group">
            <label>Confirm Password<span>*</span></label>
            <input
              type="password"
              name="confirmPassword"
              placeholder="Enter your password"
              value={formData.confirmPassword}
              onChange={handleChange}
              disabled={loading}
            />
          </div>

          {/* CREATE ACCOUNT BUTTON */}
          <button 
            type="submit" 
            className="btn-primary" 
            disabled={loading}
          >
            {loading ? 'Signing up...' : 'Sign Up'}
          </button>

          {/* GOOGLE BUTTON */}
          <button
            type="button"
            className="btn-google"
            disabled={loading}
            onClick={() => {
              const apiBase = getApiBaseUrl()
              const frontend = encodeURIComponent(window.location.origin)
              window.location.href = `${apiBase}/api/auth/google?flow=signup&frontend=${frontend}`
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>
        </form>

        {/* SIGN IN LINK */}
        <p className="footer-text">
          Already have an account? <Link to="/" className="link">Sign In</Link>
        </p>
      </div>
    </div>
  )
}
