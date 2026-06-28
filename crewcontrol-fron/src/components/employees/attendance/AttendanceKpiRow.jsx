// import { Grid } from "@mui/material";
// import KpiCard from "../../kpi/KpiCard";
// import { ATTENDANCE_STATUS } from "./attendanceData";

// import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
// import PersonOffOutlinedIcon from "@mui/icons-material/PersonOffOutlined";
// import ErrorOutlineOutlinedIcon from "@mui/icons-material/ErrorOutlineOutlined";
// import AccessTimeOutlinedIcon from "@mui/icons-material/AccessTimeOutlined";

// function AttendanceKpiRow({ counts, activeStatus, onChange }) {
//   return (
//     <Grid container spacing={2}>
//       <Grid item xs={3}>
//         <KpiCard
//           icon={<GroupsOutlinedIcon sx={{ fontSize: 32 }} />}
//           iconBg="var(--bg-success-soft)"
//           iconColor="var(--color-success)"
//           label="Present Today"
//           value={`${counts.present}/${counts.total}`}
//           isClickable
//           isActive={activeStatus === ATTENDANCE_STATUS.PRESENT}
//           onClick={() => onChange(ATTENDANCE_STATUS.PRESENT)}
//         />
//       </Grid>

//       <Grid item xs={3}>
//         <KpiCard
//           icon={<PersonOffOutlinedIcon sx={{ fontSize: 32 }} />}
//           iconBg="var(--bg-warning-soft)"
//           iconColor="#D97706"
//           label="On Leave"
//           value={`${counts.onLeave}/${counts.total}`}
//           isClickable
//           isActive={activeStatus === ATTENDANCE_STATUS.ON_LEAVE}
//           onClick={() => onChange(ATTENDANCE_STATUS.ON_LEAVE)}
//         />
//       </Grid>

//       <Grid item xs={3}>
//         <KpiCard
//           icon={<ErrorOutlineOutlinedIcon sx={{ fontSize: 32 }} />}
//           iconBg="#FECACA"
//           iconColor="var(--color-error)"
//           label="Absent Today"
//           value={`${counts.absent}/${counts.total}`}
//           isClickable
//           isActive={activeStatus === ATTENDANCE_STATUS.ABSENT}
//           onClick={() => onChange(ATTENDANCE_STATUS.ABSENT)}
//         />
//       </Grid>

//       <Grid item xs={3}>
//         <KpiCard
//           icon={<AccessTimeOutlinedIcon sx={{ fontSize: 32 }} />}
//           iconBg="var(--border-input)"
//           iconColor="#374151"
//           label="Late Check-ins"
//           value={`${counts.late}/${counts.total}`}
//           isClickable
//           isActive={activeStatus === ATTENDANCE_STATUS.LATE}
//           onClick={() => onChange(ATTENDANCE_STATUS.LATE)}
//         />
//       </Grid>
//     </Grid>
//   );
// }

// export default AttendanceKpiRow;
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

