import api from './client'

export const authApi = {
  signup: (data) => api.post('/api/auth/signup', data),
  
  verifyOtp: (email, otp, rememberMe = false) =>
    api.post('/api/auth/verify-otp', { email, otp, rememberMe }),
  
  signin: (email, password) =>
    api.post('/api/auth/signin', { email, password }),
  
  resendOtp: (email) =>
    api.post('/api/auth/resend-otp', { email }),
  
  googleAuth: () =>
    api.get('/api/auth/google'),
  
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
