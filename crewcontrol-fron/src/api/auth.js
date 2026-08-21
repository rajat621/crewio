import api from './client'

export const authApi = {
  signup: (data) => api.post('/api/auth/signup', data),
  
  verifyOtp: (email, otp, rememberMe = false) =>
    api.post('/api/auth/verify-otp', { email, otp, rememberMe }),
  
  signin: (email, password) =>
    api.post('/api/auth/signin', { email, password }),
  
  resendOtp: (email) =>
    api.post('/api/auth/resend-otp', { email }),

  forgotPassword: (email) =>
    api.post('/api/auth/forgot-password', { email }),

  verifyForgotPasswordOtp: (email, otp) =>
    api.post('/api/auth/forgot-password/verify-otp', { email, otp }),

  resetPassword: (email, resetToken, newPassword, confirmPassword) =>
    api.post('/api/auth/reset-password', { email, resetToken, newPassword, confirmPassword }),

  // googleAuth wrapper removed (dead code cleanup) - the real Google auth
  // flow is a direct window.location.href redirect (SignUp.jsx/
  // SignIn.jsx/ComprehensiveOnboarding.jsx), which an axios GET couldn't
  // support anyway (OAuth needs a full page navigation, not an awaited
  // JSON response).

  getMe: () =>
    api.get('/api/auth/me'),

  updateProfile: (data) =>
    api.patch('/api/auth/me', data),

  changePassword: (data) =>
    api.post('/api/auth/change-password', data),

  setupTwoFactor: () =>
    api.post('/api/auth/2fa/setup'),

  verifyTwoFactor: (token) =>
    api.post('/api/auth/2fa/verify', { token }),

  disableTwoFactor: () =>
    api.post('/api/auth/2fa/disable'),

  deleteAccount: (password) =>
    api.delete('/api/auth/me', { data: { password } })
}
