<<<<<<< HEAD
﻿import VerifiedUserOutlinedIcon from "@mui/icons-material/VerifiedUserOutlined";
=======
import VerifiedUserOutlinedIcon from "@mui/icons-material/VerifiedUserOutlined";
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import CancelOutlinedIcon from "@mui/icons-material/CancelOutlined";

import UniversalKpiRow from "../../kpi/UniversalKpiRow";

const KPI_ITEMS = [
  {
    key: "valid",
    label: "Valid Emirate IDs",
    icon: <VerifiedUserOutlinedIcon sx={{ fontSize: 32 }} />,
<<<<<<< HEAD
    iconBg: "var(--bg-success-soft)",
    iconColor: "var(--color-success)",
=======
    iconBg: "#DCFCE7",
    iconColor: "#16A34A",
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
    filterKey: "emirateIdStatus",
  },
  {
    key: "expiring-soon",
    label: "Expiring Soon",
    icon: <WarningAmberOutlinedIcon sx={{ fontSize: 32 }} />,
<<<<<<< HEAD
    iconBg: "var(--bg-warning-soft)",
=======
    iconBg: "#FEF3C7",
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
    iconColor: "#92400E",
    filterKey: "emirateIdStatus",
  },
  {
    key: "expired",
    label: "Expired",
    icon: <CancelOutlinedIcon sx={{ fontSize: 32 }} />,
<<<<<<< HEAD
    iconBg: "var(--bg-error-soft)",
    iconColor: "var(--color-error)",
=======
    iconBg: "#FEE2E2",
    iconColor: "#DC2626",
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
    filterKey: "emirateIdStatus",
  },
];

function EmirateIdKpiRow({ data = [], activeStatus, onChange }) {
  return <UniversalKpiRow items={KPI_ITEMS} data={data} activeKey={activeStatus} onChange={onChange} />;
}

<<<<<<< HEAD
export default EmirateIdKpiRow;
=======
export default EmirateIdKpiRow;
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
