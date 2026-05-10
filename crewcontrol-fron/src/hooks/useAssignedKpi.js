import { useMemo, useState } from "react";

/* ===== ASSIGNED STATUS ENUM ===== */
export const ASSIGNED_STATUS = {
  ASSIGNED: "assigned",
  UNASSIGNED: "unassigned",
  ENDING_SOON: "ending-soon",
};

/**
 * Assigned KPI Hook
 * - Auto-calc KPI counts
 * - Filter table by KPI
 * - Toggle KPI off on second click
 */
function useAssignedKpi(rows) {
  const [activeStatus, setActiveStatus] = useState(null);

  /* ---------- TOGGLE LOGIC ---------- */
  const toggleStatus = (status) => {
    setActiveStatus((prev) => (prev === status ? null : status));
  };

  /* ---------- KPI COUNTS ---------- */
  const counts = useMemo(() => {
    const total = rows.length;

    const assigned = rows.filter(
      (r) => r.status === ASSIGNED_STATUS.ASSIGNED
    ).length;

    const unassigned = rows.filter(
      (r) => r.status === ASSIGNED_STATUS.UNASSIGNED
    ).length;

    const endingSoon = rows.filter(
      (r) => r.status === ASSIGNED_STATUS.ENDING_SOON
    ).length;

    return {
      total,
      assigned,
      unassigned,
      endingSoon,
    };
  }, [rows]);

  /* ---------- TABLE FILTER ---------- */
  const filteredRows = useMemo(() => {
    if (!activeStatus) return rows;
    return rows.filter((r) => r.status === activeStatus);
  }, [rows, activeStatus]);

  return {
    activeStatus,     // which KPI is active
    toggleStatus,     // click handler
    counts,           // KPI numbers
    filteredRows,     // rows for table
  };
}

export default useAssignedKpi;
