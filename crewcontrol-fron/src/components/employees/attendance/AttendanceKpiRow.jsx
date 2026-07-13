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

function AttendanceKpiRow({ data = [], activeStatus, onChange }) {
  return (
    <UniversalKpiRow
      items={KPI_ITEMS}
      data={data}
      activeKey={activeStatus}
      onChange={onChange}
    />
  );
}

export default AttendanceKpiRow;

