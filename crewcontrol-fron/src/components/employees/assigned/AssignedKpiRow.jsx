// import { Grid } from "@mui/material";
// import KpiCard from "../../kpi/KpiCard";

// import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
// import PersonOffOutlinedIcon from "@mui/icons-material/PersonOffOutlined";
// import HourglassBottomOutlinedIcon from "@mui/icons-material/HourglassBottomOutlined";

// const KPI_ITEMS = [
//   {
//     key: "assigned",
//     label: "Total Assigned",
//     value: "17 /20",
//     icon: <GroupsOutlinedIcon sx={{ fontSize: 32 }} />,
//     iconBg: "var(--bg-success-soft)",
//     iconColor: "var(--color-success)",
//   },
//   {
//     key: "unassigned",
//     label: "Unassigned",
//     value: "03 /20",
//     icon: <PersonOffOutlinedIcon sx={{ fontSize: 32 }} />,
//     iconBg: "var(--bg-error-soft)",
//     iconColor: "var(--color-error)",
//   },
//   {
//     key: "ending-soon",
//     label: "Ending Soon",
//     value: "02 /20",
//     icon: <HourglassBottomOutlinedIcon sx={{ fontSize: 32 }} />,
//     iconBg: "var(--border-input)",
//     iconColor: "var(--text-secondary)",
//   },
// ];

// function AssignedKpiRow({ activeStatus, onChange }) {
//   return (
//     <Grid container spacing={2}>
//       {KPI_ITEMS.map((item) => {
//         const isActive = activeStatus === item.key;

//         return (
//           <Grid item xs={4} key={item.key}>
//             <KpiCard
//               icon={item.icon}
//               iconBg={item.iconBg}
//               iconColor={item.iconColor}
//               label={item.label}
//               value={item.value}
//               active={isActive}
//               onClick={() =>
//                 onChange(isActive ? null : item.key) // ✅ toggle off
//               }
//             />
//           </Grid>
//         );
//       })}
//     </Grid>
//   );
// }

// export default AssignedKpiRow;
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import PersonOffOutlinedIcon from "@mui/icons-material/PersonOffOutlined";

import UniversalKpiRow from "../../kpi/UniversalKpiRow";

const KPI_ITEMS = [
  {
    key: "on-site",
    label: "Worker On-Site",
    icon: <GroupsOutlinedIcon sx={{ fontSize: 32 }} />,
    iconBg: "var(--bg-success-soft)",
    iconColor: "var(--color-success)",
    filterKey: "assignedStatus",
  },
  {
    key: "on-hold",
    label: "Worker On-Hold",
    icon: <PersonOffOutlinedIcon sx={{ fontSize: 32 }} />,
    iconBg: "var(--bg-error-soft)",
    iconColor: "var(--color-error)",
    filterKey: "assignedStatus",
  },
<<<<<<< HEAD
  {
    key: "site-over",
    label: "Worker Site-Over",
    icon: <HourglassBottomOutlinedIcon sx={{ fontSize: 32 }} />,
    iconBg: "var(--border-input)",
    iconColor: "var(--text-secondary)",
    filterKey: "assignedStatus",
  },
=======
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
];

function AssignedKpiRow({ data = [], activeStatus, onChange }) {
  return (
    <UniversalKpiRow
      items={KPI_ITEMS}
      data={data}
      activeKey={activeStatus}
      onChange={onChange}
    />
  );
}

export default AssignedKpiRow;

