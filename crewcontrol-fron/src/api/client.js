import axios from 'axios'

const trimTrailingSlash = (value) => String(value || '').replace(/\/$/, '')
const trimApiSuffix = (value) => trimTrailingSlash(String(value || '').replace(/\/api\/?$/i, ''))

export const getApiBaseUrl = () => {
  const configuredUrl = import.meta.env.VITE_API_URL
  if (configuredUrl) {
    return trimApiSuffix(configuredUrl)
  }

  if (typeof window !== 'undefined') {
    const isLocalhost = /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname)
    if (isLocalhost) {
      return 'http://localhost:5000'
    }
  }

  return 'https://crewio.onrender.com'
}

const api = axios.create({
  baseURL: getApiBaseUrl()
})

// Request interceptor - add auth token
api.interceptors.request.use(
  config => {
    const token = localStorage.getItem('crewcontrol_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  error => {
    return Promise.reject(error)
  }
)

// Response interceptor - handle auth errors
api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      // Token expired or invalid
      localStorage.removeItem('crewcontrol_token')
      localStorage.removeItem('crewcontrol_user')
      window.location.href = '/'
    }
    return Promise.reject(err)
  }
)

export default api
