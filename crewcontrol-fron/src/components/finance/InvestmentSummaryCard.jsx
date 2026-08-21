import { Box, Divider, Typography } from "@mui/material";
import Card from "../shared/Card/Card";
import FinanceStatValue from "./FinanceStatValue";
import { FINANCE_ROW_HEIGHT } from "./financeLayout";

function SummaryStat({ label, amount }) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <Typography fontSize={14} color="var(--text-secondary)">
        {label}
      </Typography>
      <FinanceStatValue amount={amount} />
    </Box>
  );
}

// All-time, filter-independent (Phase 9): these are the Money Made table's
// own column sums, so they always reconcile with what's on screen next to
// it, and deliberately do NOT change when the Financial Overview date
// filter changes.
function InvestmentSummaryCard({ summary }) {
  const safe = {
    totalLaborInvestment: Number(summary?.totalLaborInvestment || 0),
    recoveredInvestment: Number(summary?.recoveredInvestment || 0),
    netProfit: Number(summary?.netProfit || 0),
  };

  return (
    <Box sx={{ width: "100%", height: FINANCE_ROW_HEIGHT, display: "flex", flexDirection: "column", gap: "16px" }}>
      <Card sx={{ px: "20px", py: "20px", flexShrink: 0 }}>
        <Typography fontSize={16} fontWeight={600} color="var(--text-primary)" mb="16px">
          Investment Summary
        </Typography>
        <SummaryStat label="Total Labor Investment" amount={safe.totalLaborInvestment} />
      </Card>

      <Card sx={{ px: "20px", py: "20px", flex: 1, display: "flex", flexDirection: "column", gap: "16px" }}>
        <SummaryStat label="Recovered Investment" amount={safe.recoveredInvestment} />
        <Divider sx={{ borderColor: "var(--border-card)" }} />
        <SummaryStat label="Net Profit" amount={safe.netProfit} />
      </Card>
    </Box>
  );
}

export default InvestmentSummaryCard;
