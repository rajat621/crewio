import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import HighlightOffOutlinedIcon from "@mui/icons-material/HighlightOffOutlined";
import PersonOffOutlinedIcon from "@mui/icons-material/PersonOffOutlined";

import UniversalKpiRow from "../../kpi/UniversalKpiRow";

const KPI_ITEMS = [
  {
    key: "present",
    label: "Present Today",
    icon: <CheckCircleOutlineIcon sx={{ fontSize: 32 }} />,
    iconBg: "var(--bg-success-soft)",
    iconColor: "var(--color-success)",
    filterKey: "attendanceStatus",
  },
  {
    key: "absent",
    label: "Absent Today",
    icon: <HighlightOffOutlinedIcon sx={{ fontSize: 32 }} />,
    iconBg: "#FECACA",
    iconColor: "var(--color-error)",
    filterKey: "attendanceStatus",
  },
  {
    key: "on-leave",
    label: "On Leave",
    icon: <PersonOffOutlinedIcon sx={{ fontSize: 32 }} />,
    iconBg: "var(--bg-warning-soft)",
    iconColor: "#92400E",
    filterKey: "attendanceStatus",
  },
];

function AttendanceKpiRow({ data = [], stats = null, activeStatus, onChange }) {
  // stats comes from GET /api/attendance/summary - {present, absent, leave, total}
  // across the full tenant population for today, not a scan of whatever
  // page of employees happens to be loaded.
  const counts = stats
    ? { present: stats.present || 0, absent: stats.absent || 0, 'on-leave': stats.leave || 0 }
    : null;
  return (
    <UniversalKpiRow
      items={KPI_ITEMS}
      data={data}
      counts={counts}
      fullTotal={stats?.total}
      activeKey={activeStatus}
      onChange={onChange}
    />
  );
}

export default AttendanceKpiRow;

