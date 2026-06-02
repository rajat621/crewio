import VerifiedUserOutlinedIcon from "@mui/icons-material/VerifiedUserOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import CancelOutlinedIcon from "@mui/icons-material/CancelOutlined";

import UniversalKpiRow from "../../kpi/UniversalKpiRow";

const KPI_ITEMS = [
  {
    key: "valid",
    label: "Valid Emirate IDs",
    icon: <VerifiedUserOutlinedIcon sx={{ fontSize: 32 }} />,
    iconBg: "#DCFCE7",
    iconColor: "#16A34A",
    filterKey: "emirateIdStatus",
  },
  {
    key: "expiring-soon",
    label: "Expiring Soon",
    icon: <WarningAmberOutlinedIcon sx={{ fontSize: 32 }} />,
    iconBg: "#FEF3C7",
    iconColor: "#92400E",
    filterKey: "emirateIdStatus",
  },
  {
    key: "expired",
    label: "Expired",
    icon: <CancelOutlinedIcon sx={{ fontSize: 32 }} />,
    iconBg: "#FEE2E2",
    iconColor: "#DC2626",
    filterKey: "emirateIdStatus",
  },
];

function EmirateIdKpiRow({ data = [], activeStatus, onChange }) {
  return <UniversalKpiRow items={KPI_ITEMS} data={data} activeKey={activeStatus} onChange={onChange} />;
}

export default EmirateIdKpiRow;