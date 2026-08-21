// Extracted from Employees.jsx during the Attendance tab's React Query
// migration - both the page (month picker UI) and hooks/useAttendance.js
// (query key + date-range params) need the exact same month math, so this
// lives in one place instead of being duplicated.

export const getCurrentMonthValue = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

export const getMonthRange = (monthValue) => {
  const [yearString, monthString] = String(monthValue || getCurrentMonthValue()).split("-");
  const year = Number(yearString);
  const monthIndex = Number(monthString) - 1;

  const start = new Date(year, monthIndex, 1, 0, 0, 0, 0);
  const end = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);

  return { start, end };
};

// Rolling N-day window ending now, keyed by day (not exact millisecond
// timestamp) so a React Query key built from it stays stable across
// re-renders within the same day. Originally duplicated inline in both
// useDashboardData.js (Home.jsx) and Company.jsx's loadCompanies - both
// used the exact same "120 days back" window; extracted here rather than
// letting a third copy happen.
export const getRollingDayRange = (days) => {
  const now = new Date();
  const from = new Date(now);
  from.setDate(now.getDate() - days);
  return { from, to: now, dayKey: now.toISOString().slice(0, 10) };
};
