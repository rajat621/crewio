import VerifiedUserOutlinedIcon from "@mui/icons-material/VerifiedUserOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import CancelOutlinedIcon from "@mui/icons-material/CancelOutlined";

import UniversalKpiRow from "../../kpi/UniversalKpiRow";

const KPI_ITEMS = [
  {
    key: "valid",
    label: "Valid Passports",
    icon: <VerifiedUserOutlinedIcon sx={{ fontSize: 32 }} />,
    iconBg: "#DCFCE7",
    iconColor: "#16A34A",
    filterKey: "passportStatus",
  },
  {
    key: "expiring-soon",
    label: "Expiring Soon",
    icon: <WarningAmberOutlinedIcon sx={{ fontSize: 32 }} />,
    iconBg: "#FEF3C7",
    iconColor: "#92400E",
    filterKey: "passportStatus",
  },
  {
    key: "expired",
    label: "Expired",
    icon: <CancelOutlinedIcon sx={{ fontSize: 32 }} />,
    iconBg: "#FEE2E2",
    iconColor: "#DC2626",
    filterKey: "passportStatus",
  },
];

function PassportKpiRow({ data = [], activeStatus, onChange }) {
  return (
    <UniversalKpiRow
      items={KPI_ITEMS}
      data={data}
      activeKey={activeStatus}
      onChange={onChange}
    />
  );
}

export default PassportKpiRow;
