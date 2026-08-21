import VerifiedUserOutlinedIcon from "@mui/icons-material/VerifiedUserOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import CancelOutlinedIcon from "@mui/icons-material/CancelOutlined";

import UniversalKpiRow from "../../kpi/UniversalKpiRow";

const KPI_ITEMS = [
  {
    key: "valid",
    label: "Valid Passports",
    icon: <VerifiedUserOutlinedIcon sx={{ fontSize: 32 }} />,
    iconBg: "var(--bg-success-soft)",
    iconColor: "var(--color-success)",
    filterKey: "passportStatus",
  },
  {
    key: "expiring-soon",
    label: "Expiring Soon",
    icon: <WarningAmberOutlinedIcon sx={{ fontSize: 32 }} />,
    iconBg: "var(--bg-warning-soft)",
    iconColor: "#92400E",
    filterKey: "passportStatus",
  },
  {
    key: "expired",
    label: "Expired",
    icon: <CancelOutlinedIcon sx={{ fontSize: 32 }} />,
    iconBg: "var(--bg-error-soft)",
    iconColor: "var(--color-error)",
    filterKey: "passportStatus",
  },
];

function PassportKpiRow({ data = [], stats = null, activeStatus, onChange }) {
  // stats.passportStatus (from GET /api/employees/stats) is the
  // full-tenant-population count, keyed by the same enum values this
  // row's items already use ("valid"/"expiring-soon"/"expired") - passed
  // straight through as `counts`. Falls back to scanning `data` only if
  // stats hasn't loaded yet, so the row isn't blank during that window.
  const counts = stats?.passportStatus
    ? { valid: stats.passportStatus.valid || 0, 'expiring-soon': stats.passportStatus['expiring-soon'] || 0, expired: stats.passportStatus.expired || 0 }
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

export default PassportKpiRow;

