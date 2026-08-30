import { memo } from "react";
import { Grid } from "@mui/material";
import KpiCard from "../kpi/KpiCard";
import FinanceStatValue from "./FinanceStatValue";

import Diversity3OutlinedIcon from "@mui/icons-material/Diversity3Outlined";
import PersonAddAltOutlinedIcon from "@mui/icons-material/PersonAddAltOutlined";
import GroupAddOutlinedIcon from "@mui/icons-material/GroupAddOutlined";
import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined";

// Labels are passed as plain strings, same as Home's KpiGrid, so they
// render through KpiCard's own default Typography (fontSize 16) instead of
// a smaller custom override - keeps this page's cards visually consistent
// with Home's.
function FinanceStatsGrid({ totals }) {
  const safeTotals = {
    totalRevenue: Number(totals?.totalRevenue || 0),
    totalExpenses: Number(totals?.totalExpenses || 0),
    vatCollected: Number(totals?.vatCollected || 0),
    netProfit: Number(totals?.netProfit || 0),
  };

  return (
    <>
      <Grid item xs={12} sm={6} md={3}>
        <KpiCard
          icon={<Diversity3OutlinedIcon sx={{ fontSize: 32 }} />}
          iconBg="var(--bg-info-soft)"
          iconColor="var(--color-primary)"
          label="Total Revenue"
          value={<FinanceStatValue amount={safeTotals.totalRevenue} />}
        />
      </Grid>

      <Grid item xs={12} sm={6} md={3}>
        <KpiCard
          icon={<PersonAddAltOutlinedIcon sx={{ fontSize: 32 }} />}
          iconBg="var(--bg-success-soft)"
          iconColor="var(--color-success)"
          label="Total Expenses"
          value={<FinanceStatValue amount={safeTotals.totalExpenses} />}
        />
      </Grid>

      <Grid item xs={12} sm={6} md={3}>
        <KpiCard
          icon={<GroupAddOutlinedIcon sx={{ fontSize: 32 }} />}
          iconBg="var(--bg-success-soft)"
          iconColor="var(--color-success)"
          label="VAT Collected"
          value={<FinanceStatValue amount={safeTotals.vatCollected} />}
        />
      </Grid>

      <Grid item xs={12} sm={6} md={3}>
        <KpiCard
          icon={<AssignmentOutlinedIcon sx={{ fontSize: 32 }} />}
          iconBg="#FCE7F3"
          iconColor="var(--color-error)"
          label="Net Profit"
          value={<FinanceStatValue amount={safeTotals.netProfit} />}
        />
      </Grid>
    </>
  );
}

export default memo(FinanceStatsGrid);
