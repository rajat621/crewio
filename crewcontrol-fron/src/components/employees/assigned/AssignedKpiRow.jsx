import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import HourglassBottomOutlinedIcon from "@mui/icons-material/HourglassBottomOutlined";
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
    label: "Worker Unassigned",
    icon: <PersonOffOutlinedIcon sx={{ fontSize: 32 }} />,
    iconBg: "var(--bg-error-soft)",
    iconColor: "var(--color-error)",
    filterKey: "assignedStatus",
  },
  {
    key: "site-over",
    label: "Worker Site-Over",
    icon: <HourglassBottomOutlinedIcon sx={{ fontSize: 32 }} />,
    iconBg: "var(--border-input)",
    iconColor: "var(--text-secondary)",
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

