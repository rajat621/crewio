import { useMemo, useState } from "react";

/* ===== ASSIGNED STATUS ENUM ===== */
export const ASSIGNED_STATUS = {
  ON_SITE: "on-site",
  ON_HOLD: "on-hold",
  SITE_OVER: "site-over",
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

    const assigned = rows.filter((r) => r.assignedStatus === ASSIGNED_STATUS.ON_SITE).length;
    const onHold = rows.filter((r) => r.assignedStatus === ASSIGNED_STATUS.ON_HOLD).length;
    const siteOver = rows.filter((r) => r.assignedStatus === ASSIGNED_STATUS.SITE_OVER).length;

    return {
      total,
      assigned,
      onHold,
      siteOver,
    };
  }, [rows]);

  /* ---------- TABLE FILTER ---------- */
  const filteredRows = useMemo(() => {
    if (!activeStatus) return rows;
    return rows.filter((r) => r.assignedStatus === activeStatus);
  }, [rows, activeStatus]);

  return {
    activeStatus,     // which KPI is active
    toggleStatus,     // click handler
    counts,           // KPI numbers
    filteredRows,     // rows for table
  };
}

export default useAssignedKpi;
