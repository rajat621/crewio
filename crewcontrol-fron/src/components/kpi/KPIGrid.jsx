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
        iconBg="var(--bg-info-soft)"
        iconColor="var(--color-primary)"
        label="Total Workers"
        value={String(safeKpis.totalWorkers)}
        />
      </Grid>

      <Grid item xs={3}>
      <KpiCard
        icon={<PersonPinCircleOutlinedIcon sx={{ fontSize: 32 }} />}
        iconBg="var(--bg-success-soft)"
        iconColor="var(--color-success)"
        label="Workers On-Site"
        value={String(safeKpis.workersOnSite)}
        />
      </Grid>

      <Grid item xs={3}>
      <KpiCard
        icon={<PersonOffOutlinedIcon sx={{ fontSize: 32 }} />}
        iconBg="var(--bg-error-soft)"
        iconColor="var(--color-error)"
        label="On hold worker"
        value={String(safeKpis.onHoldWorkers)}
        />
      </Grid>

      {/* Inactive per request - kept visible (not removed), matching the
          same disabled treatment used for Dark Mode/Language in the
          profile popup, rather than being taken off the dashboard. */}
      <Grid item xs={3}>
      <KpiCard
        icon={<ReceiptLongOutlinedIcon sx={{ fontSize: 32 }} />}
        iconBg="#FCE7F3"
        iconColor="var(--color-error)"
        label="Revenue"
        value={String(0)}
        disabled
        />
      </Grid>
    </>
  );
}

export default KpiGrid;