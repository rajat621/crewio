import api from './client'

// markAttendance/updateAttendance/deleteAttendance/getAttendanceSummary
// removed (dead code cleanup) - zero usage anywhere in the frontend,
// confirmed via whole-word search across every file including the
// not-yet-migrated large pages. The backend endpoints they wrapped still
// exist and can be re-added here if a future feature needs them.
export const attendanceApi = {
  getAttendance: (params) =>
    api.get('/api/attendance', { params }),

  // One {date, present} row per calendar day in range - see
  // attendance.controller.js's getAttendanceDailyCounts. Used by the
  // dashboard's weekly/monthly chart instead of fetching every raw
  // attendance document just to count them client-side.
  getDailyCounts: (params) =>
    api.get('/api/attendance/daily-counts', { params }),

  // Today's present/absent/leave/total across the FULL tenant population
  // (single aggregation, see attendance.controller.js's
  // getAttendanceSummary) - used for the Attendance tab's KPI row instead
  // of counting today's status across whatever page of employees is
  // currently loaded.
  getSummary: (params) =>
    api.get('/api/attendance/summary', { params }),

  // {employeeId, dateKeys: ['YYYY-MM-DD', ...]} per employee with any
  // present/on-leave record in range, UAE-day-bucketed and deduplicated
  // server-side (see attendance.controller.js's getAttendanceRecordedDates)
  // - backs the Home dashboard's absent-streak alert instead of it
  // reducing every raw attendance document itself.
  getRecordedDates: (params) =>
    api.get('/api/attendance/recorded-dates', { params }),
}
