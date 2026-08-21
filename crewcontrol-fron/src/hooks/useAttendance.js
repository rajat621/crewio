import { useQuery } from '@tanstack/react-query'
import { attendanceApi } from '../api/attendance'
import { queryKeys } from '../queryKeys'
import { normalizeListResponse } from '../utils/apiResponseNormalizer'
import { cacheConfig } from '../config/cacheConfig'
import { getCurrentMonthValue, getMonthRange } from '../utils/dateRanges'

// Wraps the attendance list fetch previously in Employees.jsx's
// loadAttendanceRecords. Preserves the exact same date-range logic,
// verbatim - not simplified: the fetched range is the UNION of the
// selected month and the current month, so "up to today" is always
// included even when viewing a past month. This was a deliberate business
// rule in the original code (not just an implementation detail), so it's
// reproduced exactly rather than reduced to "just the selected month."
export const useAttendance = (monthValue) => {
  const selectedRange = getMonthRange(monthValue);
  const currentRange = getMonthRange(getCurrentMonthValue());
  const from = selectedRange.start < currentRange.start ? selectedRange.start : currentRange.start;
  const to = selectedRange.end > currentRange.end ? selectedRange.end : currentRange.end;

  return useQuery({
    queryKey: queryKeys.attendance.list({ month: monthValue }),
    queryFn: async () => {
      const response = await attendanceApi.getAttendance({
        from: from.toISOString(),
        to: to.toISOString(),
      });
      return normalizeListResponse(response).items;
    },
    staleTime: cacheConfig.attendance.staleTime,
    gcTime: cacheConfig.attendance.gcTime,
  });
};
