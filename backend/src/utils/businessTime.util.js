// Canonical "what calendar day is it right now" for the app's business
// timezone (UAE - Asia/Dubai, UTC+4, no DST, so a fixed offset is exact
// year-round, no timezone database/library needed).
//
// Found during a timezone audit: "today" boundaries for attendance
// (getAttendanceSummary's Present/Absent/On Leave KPIs, the dashboard's
// daily-counts chart bucketing) were being computed with plain
// `new Date(); date.setHours(0,0,0,0)` - which uses the Node PROCESS's
// local timezone, not the business's. That's whatever the deployment
// happens to be (commonly UTC in containers), not UAE - so "today" could
// silently be off by up to 4 hours around midnight UAE time depending on
// where/how the backend is deployed, with zero code change required to
// trigger it. All UTC-arithmetic below (Date.UTC/getUTC*) is deliberately
// used instead of the Date object's local-timezone methods, so the result
// is identical no matter what timezone the Node process itself is running
// in.
const UAE_OFFSET_MS = 4 * 60 * 60 * 1000;

// Start/end of the current UAE calendar day, as real UTC Date instants -
// safe to use directly in a Mongo $gte/$lte range query against a BSON
// Date field (BSON Date is always a UTC instant internally regardless of
// how it's displayed).
export const getUaeDayBounds = (instant = new Date()) => {
  const shifted = new Date(instant.getTime() + UAE_OFFSET_MS);
  const startUtcMs =
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate(), 0, 0, 0, 0) - UAE_OFFSET_MS;
  return {
    start: new Date(startUtcMs),
    end: new Date(startUtcMs + 24 * 60 * 60 * 1000 - 1),
  };
};

// "YYYY-MM-DD" for the UAE calendar day `instant` falls in - matches the
// format $dateToString produces when given the same `timezone: '+04:00'`,
// so backend day-bucketed aggregates and this key always agree.
export const getUaeDateKey = (instant = new Date()) => {
  const shifted = new Date(instant.getTime() + UAE_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shifted.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Mongo aggregation operators take timezone as a fixed UTC-offset string
// (no DST table needed for UAE) - pass this into any $dateToString/
// $dateTrunc that buckets by calendar day so the grouping lines up with
// getUaeDayBounds/getUaeDateKey above instead of defaulting to UTC.
export const UAE_TIMEZONE_OFFSET = '+04:00';

// "HH:MM" for `instant` in UAE local time - for displaying a check-in/
// check-out time-of-day. date.getHours()/getMinutes() would use the Node
// PROCESS's timezone (same class of bug getUaeDayBounds above exists to
// avoid), which is wrong for the same reason: a server running in UTC
// would show a check-in that actually happened at 23:30 UAE as "19:30".
export const getUaeTimeString = (instant = new Date()) => {
  const shifted = new Date(instant.getTime() + UAE_OFFSET_MS);
  const hours = String(shifted.getUTCHours()).padStart(2, '0');
  const minutes = String(shifted.getUTCMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};
