// src/components/employees/attendance/attendanceUtils.js

import { ATTENDANCE_STATUS } from "./attendanceData";

export const STATUS_CONFIG = {
  [ATTENDANCE_STATUS.PRESENT]: {
    label: "Present",
    bg: "var(--bg-success-soft)",
    color: "#15803D",
  },
  [ATTENDANCE_STATUS.ON_LEAVE]: {
    label: "On Leave",
    bg: "var(--bg-warning-soft)",
    color: "#92400E",
  },
  [ATTENDANCE_STATUS.ABSENT]: {
    label: "Absent",
    bg: "#FECACA",
    color: "var(--color-error)",
  },
  [ATTENDANCE_STATUS.LATE]: {
    label: "Late",
    bg: "var(--border-input)",
    color: "#374151",
  },
};

export const countByStatus = (rows, status) =>
  rows.filter((r) => r.status === status).length;

