import { Grid } from "@mui/material";
import KpiCard from "./KpiCard";

import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import PersonPinCircleOutlinedIcon from "@mui/icons-material/PersonPinCircleOutlined";
import PersonOffOutlinedIcon from "@mui/icons-material/PersonOffOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";

function KpiGrid({ kpis }) {
  const safeKpis = {
    totalWorkers: Number(kpis?.totalWorkers || 0),
    workersOnSite: Number(kpis?.workersOnSite || 0),
    onHoldWorkers: Number(kpis?.onHoldWorkers || 0),
    revenueCount: Number(kpis?.revenueCount || 0),
  };

  return (
    <>
      <Grid item xs={3}>
      <KpiCard
        icon={<GroupsOutlinedIcon sx={{ fontSize: 32 }} />}
<<<<<<< HEAD
        iconBg="var(--bg-info-soft)"
        iconColor="var(--color-primary)"
=======
        iconBg="#E3E9FA"
        iconColor="#1D4ED8"
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
        label="Total Workers"
        value={String(safeKpis.totalWorkers)}
        />
      </Grid>

      <Grid item xs={3}>
      <KpiCard
        icon={<PersonPinCircleOutlinedIcon sx={{ fontSize: 32 }} />}
<<<<<<< HEAD
        iconBg="var(--bg-success-soft)"
        iconColor="var(--color-success)"
=======
        iconBg="#DCFCE7"
        iconColor="#16A34A"
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
        label="Workers On-Site"
        value={String(safeKpis.workersOnSite)}
        />
      </Grid>

      <Grid item xs={3}>
      <KpiCard
        icon={<PersonOffOutlinedIcon sx={{ fontSize: 32 }} />}
<<<<<<< HEAD
        iconBg="var(--bg-error-soft)"
        iconColor="var(--color-error)"
=======
        iconBg="#FEE2E2"
        iconColor="#DC2626"
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
        label="On hold worker"
        value={String(safeKpis.onHoldWorkers)}
        />
      </Grid>

      <Grid item xs={3}>
      <KpiCard
        icon={<ReceiptLongOutlinedIcon sx={{ fontSize: 32 }} />}
        iconBg="#FCE7F3"
<<<<<<< HEAD
        iconColor="var(--color-error)"
=======
        iconColor="#EC4899"
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
        label="Revenue"
        value={String(safeKpis.revenueCount)}
        />
      </Grid>
    </>
  );
}

export default KpiGrid;

