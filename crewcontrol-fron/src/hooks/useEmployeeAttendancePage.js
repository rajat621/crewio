import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { employeesApi } from '../api/employees'
import { attendanceApi } from '../api/attendance'
import { queryKeys } from '../queryKeys'

// Employees -> Attendance tab: server-paginated employees already joined
// with their attendance (see employee.controller.js's
// getEmployeeAttendancePage) - was previously built by joining the
// selected month's attendance against a single capped-at-200 employees
// fetch entirely in the browser, so any employee outside that page was
// invisible to this tab regardless of their real attendance record.
// `enabled` (default true) lets Employees.jsx defer this until the
// Attendance/Track Employee tab is actually open, instead of firing on
// every page load regardless of active tab - see useEmployeesPage.js's
// matching comment.
export const useEmployeeAttendancePage = (page, limit, search, month, status, enabled = true) =>
  useQuery({
    queryKey: queryKeys.employees.list({ scope: 'attendance-page', page, limit, search: search || '', month: month || '', status: status || '' }),
    queryFn: async () => {
      const res = await employeesApi.getEmployeeAttendancePage({ page, limit, search: search || undefined, month: month || undefined, status: status || undefined })
      return { items: res?.data?.data || [], meta: res?.data?.meta || { total: 0 } }
    },
    placeholderData: keepPreviousData,
    enabled,
  })

// Today's present/absent/leave across the FULL tenant population - the
// Attendance tab's KPI row (Present Today/Absent Today/On Leave) reads
// from this, never from summing the currently-loaded page of rows.
export const useAttendanceSummary = (enabled = true) =>
  useQuery({
    queryKey: queryKeys.attendance.list({ scope: 'summary' }),
    queryFn: async () => (await attendanceApi.getSummary())?.data?.data || null,
    enabled,
  })
