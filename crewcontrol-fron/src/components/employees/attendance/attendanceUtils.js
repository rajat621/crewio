// src/components/employees/attendance/attendanceUtils.js

import { ATTENDANCE_STATUS } from "./attendanceData";

export const STATUS_CONFIG = {
  [ATTENDANCE_STATUS.PRESENT]: {
    label: "Present",
    bg: "#DCFCE7",
    color: "#15803D",
  },
  [ATTENDANCE_STATUS.ON_LEAVE]: {
    label: "On Leave",
    bg: "#FEF3C7",
    color: "#92400E",
  },
  [ATTENDANCE_STATUS.ABSENT]: {
    label: "Absent",
    bg: "#FECACA",
    color: "#DC2626",
  },
  [ATTENDANCE_STATUS.LATE]: {
    label: "Late",
    bg: "#E5E7EB",
    color: "#374151",
  },
};

export const countByStatus = (rows, status) =>
  rows.filter((r) => r.status === status).length;
