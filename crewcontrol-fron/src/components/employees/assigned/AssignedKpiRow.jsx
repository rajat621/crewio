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
//     iconBg: "#DCFCE7",
//     iconColor: "#16A34A",
//   },
//   {
//     key: "unassigned",
//     label: "Unassigned",
//     value: "03 /20",
//     icon: <PersonOffOutlinedIcon sx={{ fontSize: 32 }} />,
//     iconBg: "#FEE2E2",
//     iconColor: "#DC2626",
//   },
//   {
//     key: "ending-soon",
//     label: "Ending Soon",
//     value: "02 /20",
//     icon: <HourglassBottomOutlinedIcon sx={{ fontSize: 32 }} />,
//     iconBg: "#E5E7EB",
//     iconColor: "#6B7280",
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
    key: "assigned",
    label: "Total Assigned",
    icon: <GroupsOutlinedIcon sx={{ fontSize: 32 }} />,
    iconBg: "#DCFCE7",
    iconColor: "#16A34A",
    filterKey: "assignedStatus",
  },
  {
    key: "unassigned",
    label: "Unassigned",
    icon: <PersonOffOutlinedIcon sx={{ fontSize: 32 }} />,
    iconBg: "#FEE2E2",
    iconColor: "#DC2626",
    filterKey: "assignedStatus",
  },
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
