import api from './client'

export const dashboardApi = {
  // Combines employees/stats + attendance/daily-counts into one response -
  // see dashboard.controller.js's getDashboardSummary. Used for Home's
  // critical-path KPI tiles + chart instead of two separate requests.
  getSummary: (params) =>
    api.get('/api/dashboard/summary', { params }),

  // Finance page's stat cards, revenue/profit trend, companies invoice
  // totals, and per-employee investment breakdown - see dashboard.
  // controller.js's getFinanceSummary.
  getFinanceSummary: (params) =>
    api.get('/api/dashboard/finance-summary', { params }),
}
