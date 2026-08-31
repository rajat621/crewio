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
  // stats.assignedStatus is a denormalized cache of `company` that can
  // drift (see employee.controller.js's getEmployeeStats). onSite/onHold/
  // siteOver are computed there from the same company-null predicate the
  // Assign Employee popup uses, so reading those instead - not
  // stats.assignedStatus directly - is what keeps this KPI and the popup
  // from ever disagreeing again.
  const counts = stats
    ? { 'on-site': stats.onSite || 0, 'on-hold': stats.onHold || 0, 'site-over': stats.siteOver || 0 }
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

