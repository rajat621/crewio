import { memo } from "react";
import { Grid, Typography } from "@mui/material";
import KpiCard from "../kpi/KpiCard";
import FinanceStatValue from "./FinanceStatValue";

import Diversity3OutlinedIcon from "@mui/icons-material/Diversity3Outlined";
import PersonAddAltOutlinedIcon from "@mui/icons-material/PersonAddAltOutlined";
import GroupAddOutlinedIcon from "@mui/icons-material/GroupAddOutlined";
import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined";

// KpiCard's label sits in a narrow right-aligned column next to the fixed
// 70px icon circle - fine for Home's short single-word labels, but
// Finance's two-word labels ("Total Expenses", "VAT Collected") wrap onto
// a second line there and visually collide with the icon above. KpiCard
// itself renders `label` verbatim inside its own Typography, so passing a
// smaller, non-wrapping Typography as the label (same trick used for
// `value`/FinanceStatValue) fixes this without touching the shared
// component or Home's layout.
function StatLabel({ children }) {
  return (
    <Typography
      component="span"
      fontSize={13}
      color="var(--text-secondary)"
      whiteSpace="nowrap"
      textAlign="right"
    >
      {children}
    </Typography>
  );
}

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
          label={<StatLabel>Total Revenue</StatLabel>}
          value={<FinanceStatValue amount={safeTotals.totalRevenue} />}
        />
      </Grid>

      <Grid item xs={12} sm={6} md={3}>
        <KpiCard
          icon={<PersonAddAltOutlinedIcon sx={{ fontSize: 32 }} />}
          iconBg="var(--bg-success-soft)"
          iconColor="var(--color-success)"
          label={<StatLabel>Total Expenses</StatLabel>}
          value={<FinanceStatValue amount={safeTotals.totalExpenses} />}
        />
      </Grid>

      <Grid item xs={12} sm={6} md={3}>
        <KpiCard
          icon={<GroupAddOutlinedIcon sx={{ fontSize: 32 }} />}
          iconBg="var(--bg-success-soft)"
          iconColor="var(--color-success)"
          label={<StatLabel>VAT Collected</StatLabel>}
          value={<FinanceStatValue amount={safeTotals.vatCollected} />}
        />
      </Grid>

      <Grid item xs={12} sm={6} md={3}>
        <KpiCard
          icon={<AssignmentOutlinedIcon sx={{ fontSize: 32 }} />}
          iconBg="#FCE7F3"
          iconColor="var(--color-error)"
          label={<StatLabel>Net Profit</StatLabel>}
          value={<FinanceStatValue amount={safeTotals.netProfit} />}
        />
      </Grid>
    </>
  );
}

export default memo(FinanceStatsGrid);
