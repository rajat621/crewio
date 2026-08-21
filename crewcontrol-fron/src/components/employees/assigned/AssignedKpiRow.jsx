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

function AssignedKpiRow({ data = [], stats = null, activeStatus, onChange }) {
  // stats.assignedStatus is the canonical, full-population count (see
  // employee.controller.js's getEmployeeStats) - "on-hold" here IS
  // "Unassigned" in the business rule this row displays, not a
  // separately-computed company-null check.
  const counts = stats?.assignedStatus
    ? { 'on-site': stats.assignedStatus['on-site'] || 0, 'on-hold': stats.assignedStatus['on-hold'] || 0, 'site-over': stats.assignedStatus['site-over'] || 0 }
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

export default AssignedKpiRow;

