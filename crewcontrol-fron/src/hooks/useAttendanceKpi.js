import { useMemo, useState } from "react";

/**
 * Attendance KPI logic
 * - Auto calculates KPI numbers
 * - Filters table data
 * - Toggles KPI off on second click
 */
export const ATTENDANCE_STATUS = {
  PRESENT: "present",
  ON_LEAVE: "on-leave",
  ABSENT: "absent",
  LATE: "late",
};

function useAttendanceKpi(rows) {
  const [activeStatus, setActiveStatus] = useState(null);

  // Toggle logic (same KPI clicked twice → reset)
  const toggleStatus = (status) => {
    setActiveStatus((prev) => (prev === status ? null : status));
  };

  // KPI counts
  const counts = useMemo(() => {
    const total = rows.length;

    return {
      total,
      present: rows.filter((r) => r.status === ATTENDANCE_STATUS.PRESENT).length,
      onLeave: rows.filter((r) => r.status === ATTENDANCE_STATUS.ON_LEAVE).length,
      absent: rows.filter((r) => r.status === ATTENDANCE_STATUS.ABSENT).length,
      late: rows.filter((r) => r.status === ATTENDANCE_STATUS.LATE).length,
    };
  }, [rows]);

  // Table filtering
  const filteredRows = useMemo(() => {
    if (!activeStatus) return rows;
    return rows.filter((r) => r.status === activeStatus);
  }, [rows, activeStatus]);

  return {
    activeStatus,
    toggleStatus,
    counts,
    filteredRows,
  };
}

export default useAttendanceKpi;
