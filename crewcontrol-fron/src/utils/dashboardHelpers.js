// Extracted verbatim from Home.jsx during the dashboard's React Query
// migration - pure helper functions, zero logic changes. parseDataArray
// (which was here originally) is not included - superseded by
// apiResponseNormalizer.js's normalizeListResponse, used in the new
// dashboard query hooks instead of being duplicated here.

const DAY_MS = 1000 * 60 * 60 * 24;

const getStartOfDay = (value) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

const getDateKey = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// Timezone audit finding: getDateKey (above) uses the BROWSER's local
// timezone, which is fine for things like "days until this document
// expires" (a genuinely local/relative concept), but wrong for matching
// "today" against /api/attendance/daily-counts - that endpoint now groups
// by the fixed UAE business day (see backend's businessTime.util.js), so
// looking it up with a browser-local key would silently return the wrong
// (or no) row for any viewer not in UTC+4, especially near midnight in
// either timezone. UAE has no DST, so a fixed +4h offset is exact
// year-round - no timezone library needed, and this computes identically
// regardless of the viewer's own browser/OS timezone.
const UAE_OFFSET_MS = 4 * 60 * 60 * 1000;
const getUaeDateKey = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const shifted = new Date(date.getTime() + UAE_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const normalizeAttendanceStatus = (status) => {
  if (status === "leave") return "on-leave";
  if (status === "half-day") return "present";
  return status || "absent";
};

const buildWeeklyChartData = (attendanceRecords, employeeIdsSet, totalEmployees = 0) => {
  const now = new Date();
  const today = getStartOfDay(now);
  const dayIndex = today.getDay();
  const mondayOffset = dayIndex === 0 ? -6 : 1 - dayIndex;
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() + mondayOffset);

  const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const buckets = labels.map((label, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    return {
      day: label,
      key: getDateKey(date),
      // Whether this day has actually happened yet - a future day within
      // the current week genuinely has no attendance data (it hasn't
      // occurred), so it should stay blank rather than being counted as
      // "everyone absent".
      hasOccurred: date.getTime() <= today.getTime(),
      present: 0,
      absent: 0,
    };
  });

  const bucketByDate = new Map(buckets.map((bucket) => [bucket.key, bucket]));

  attendanceRecords.forEach((record) => {
    const employeeId = String(record?.employee || "");
    if (employeeIdsSet && !employeeIdsSet.has(employeeId)) return;

    const key = getDateKey(record?.date);
    const bucket = bucketByDate.get(key);
    if (!bucket) return;

    const status = normalizeAttendanceStatus(record?.status);
    if (status === "present") bucket.present += 1;
  });

  // Absence is "no attendance record for that day" throughout this app
  // (see attendance fix notes) - an explicit 'absent' status record is
  // almost never actually created, so counting only those (as this used
  // to) meant real absences never showed up. For any day that's already
  // happened, everyone not marked present is absent; e.g. 10 employees, 4
  // present on Monday -> 6 absent, not 0.
  return buckets.map(({ day, present, hasOccurred }) => ({
    day,
    present,
    absent: hasOccurred ? Math.max(0, totalEmployees - present) : 0,
  }));
};

const buildMonthlyChartData = (attendanceRecords, employeeIdsSet, totalEmployees = 0) => {
  const now = new Date();
  const today = getStartOfDay(now);
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalWeeks = Math.ceil(daysInMonth / 7);

  const buckets = Array.from({ length: totalWeeks }, (_, index) => {
    // First day of this week-of-the-month bucket, to know whether the
    // week has started yet (same "don't fabricate absences for the
    // future" reasoning as the weekly chart).
    const weekStartDate = new Date(year, month, index * 7 + 1);
    return {
      day: `Week ${index + 1}`,
      hasOccurred: weekStartDate.getTime() <= today.getTime(),
      present: 0,
      absent: 0,
    };
  });

  attendanceRecords.forEach((record) => {
    const employeeId = String(record?.employee || "");
    if (employeeIdsSet && !employeeIdsSet.has(employeeId)) return;

    const date = new Date(record?.date);
    if (Number.isNaN(date.getTime())) return;
    if (date.getFullYear() !== year || date.getMonth() !== month) return;

    const weekIndex = Math.floor((date.getDate() - 1) / 7);
    const bucket = buckets[weekIndex];
    if (!bucket) return;

    const status = normalizeAttendanceStatus(record?.status);
    if (status === "present") bucket.present += 1;
  });

  // Same reasoning as the weekly chart: absence is "not present", derived
  // from the total employee count, not from rare explicit 'absent'
  // records - only for weeks that have actually started.
  return buckets.map(({ day, present, hasOccurred }) => ({
    day,
    present,
    absent: hasOccurred ? Math.max(0, totalEmployees - present) : 0,
  }));
};

// Same bucket shape/absence math as buildWeeklyChartData/
// buildMonthlyChartData above, but sourced from the backend's pre-
// aggregated daily present-counts (GET /api/attendance/daily-counts -
// one {date, present} row per calendar day) instead of raw attendance
// documents. Replaces a ~40k-row document fetch + in-browser per-record
// scan with a payload bounded by day count, not record count - see
// attendance.controller.js's getAttendanceDailyCounts for the aggregation.
const buildWeeklyChartDataFromCounts = (dailyPresentCounts, totalEmployees = 0) => {
  const now = new Date();
  const today = getStartOfDay(now);
  const dayIndex = today.getDay();
  const mondayOffset = dayIndex === 0 ? -6 : 1 - dayIndex;
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() + mondayOffset);

  const presentByDate = new Map((dailyPresentCounts || []).map((row) => [row.date, row.present]));

  const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return labels.map((label, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    const key = getDateKey(date);
    const hasOccurred = date.getTime() <= today.getTime();
    const present = presentByDate.get(key) || 0;
    return { day: label, present, absent: hasOccurred ? Math.max(0, totalEmployees - present) : 0 };
  });
};

const buildMonthlyChartDataFromCounts = (dailyPresentCounts, totalEmployees = 0) => {
  const now = new Date();
  const today = getStartOfDay(now);
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalWeeks = Math.ceil(daysInMonth / 7);

  const buckets = Array.from({ length: totalWeeks }, (_, index) => {
    const weekStartDate = new Date(year, month, index * 7 + 1);
    return { day: `Week ${index + 1}`, hasOccurred: weekStartDate.getTime() <= today.getTime(), present: 0 };
  });

  (dailyPresentCounts || []).forEach((row) => {
    const date = new Date(row.date);
    if (Number.isNaN(date.getTime())) return;
    if (date.getFullYear() !== year || date.getMonth() !== month) return;
    const weekIndex = Math.floor((date.getDate() - 1) / 7);
    if (buckets[weekIndex]) buckets[weekIndex].present += row.present || 0;
  });

  return buckets.map(({ day, present, hasOccurred }) => ({
    day,
    present,
    absent: hasOccurred ? Math.max(0, totalEmployees - present) : 0,
  }));
};

const daysUntil = (targetDate) => {
  const today = getStartOfDay(new Date());
  const target = getStartOfDay(targetDate);
  return Math.ceil((target - today) / DAY_MS);
};

const getEmployeeDisplayName = (employee) => {
  const fullName = `${employee?.firstName || ""} ${employee?.lastName || ""}`.trim();
  return (
    fullName ||
    employee?.name ||
    employee?.fullName ||
    employee?.employeeName ||
    employee?.employeeId ||
    "Employee"
  );
};

const isExpiringSoon = (expiryValue, explicitStatus) => {
  if (explicitStatus === "expiring-soon") return true;
  if (!expiryValue) return false;

  // "One month before expiry" per request - was 15 days.
  const days = daysUntil(expiryValue);
  return days >= 0 && days <= 30;
};

const isExpired = (expiryValue, explicitStatus) => {
  if (explicitStatus === "expired") return true;
  if (!expiryValue) return false;
  return daysUntil(expiryValue) < 0;
};

export {
  DAY_MS,
  getStartOfDay,
  getDateKey,
  getUaeDateKey,
  normalizeAttendanceStatus,
  buildWeeklyChartData,
  buildMonthlyChartData,
  buildWeeklyChartDataFromCounts,
  buildMonthlyChartDataFromCounts,
  daysUntil,
  getEmployeeDisplayName,
  isExpiringSoon,
  isExpired,
};
