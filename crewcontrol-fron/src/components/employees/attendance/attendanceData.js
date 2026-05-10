// src/components/employees/attendance/attendanceData.js

export const ATTENDANCE_STATUS = {
  PRESENT: "present",
  ON_LEAVE: "on-leave",
  ABSENT: "absent",
  LATE: "late",
};

export const attendanceRows = [
  {
    id: "WKNEL250001",
    name: "Glyn Giacoppo",
    checkIn: "09:08 AM",
    checkOut: "06:00 PM",
    totalWorks: 10,
    totalAbsent: 0,
    status: ATTENDANCE_STATUS.PRESENT,
  },
  {
    id: "WKNEL250002",
    name: "Glyn Giacoppo",
    checkIn: "—",
    checkOut: "—",
    totalWorks: 8,
    totalAbsent: 2,
    status: ATTENDANCE_STATUS.ON_LEAVE,
  },
  {
    id: "WKNEL250003",
    name: "Glyn Giacoppo",
    checkIn: "09:08 AM",
    checkOut: "06:00 PM",
    totalWorks: 10,
    totalAbsent: 0,
    status: ATTENDANCE_STATUS.PRESENT,
  },
  {
    id: "WKNEL250004",
    name: "Glyn Giacoppo",
    checkIn: "—",
    checkOut: "—",
    totalWorks: 9,
    totalAbsent: 1,
    status: ATTENDANCE_STATUS.ABSENT,
  },
  {
    id: "WKNEL250005",
    name: "Glyn Giacoppo",
    checkIn: "09:45 AM",
    checkOut: "06:00 PM",
    totalWorks: 8,
    totalAbsent: 0,
    status: ATTENDANCE_STATUS.LATE,
  },
];
