// src/pages/Finance.jsx
import { Box, Typography, Grid, MenuItem, Select } from "@mui/material";
import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useFinanceData } from "../hooks/useFinanceData";
import FinanceStatsGrid from "../components/finance/FinanceStatsGrid";
import FinanceOverviewCard from "../components/finance/FinanceOverviewCard";
import CompaniesCard from "../components/finance/CompaniesCard";
import MoneyMadeCard from "../components/finance/MoneyMadeCard";
import InvestmentSummaryCard from "../components/finance/InvestmentSummaryCard";

// Exact ranges these resolve to server-side (dashboard.controller.js's
// getFinancePeriodRange):
//   monthly   -> current calendar month
//   yearly    -> current calendar year
//   lastMonth -> previous calendar month
//   lastYear  -> previous calendar year
const PERIOD_OPTIONS = [
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
  { value: "lastMonth", label: "Last Month" },
  { value: "lastYear", label: "Last Year" },
];

function Finance() {
  const { user } = useAuth();
  const [period, setPeriod] = useState("monthly");
  const { data, isLoading } = useFinanceData(period);

  return (
    // DashboardLayout's shared main-content area is the scroll container
    // (see its own overflow:"auto" fix) - this Box just needs its trailing
    // pb:"24px" to become a real, reachable gap under the last row (Money
    // Made / Investment Summary) once scrolled to the bottom.
    <Box
      sx={{
        px: "40px",
        pt: "24px",
        pb: "24px",
      }}
    >
      {/* HEADING */}
      <Box
        sx={{
          minHeight: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "12px",
          mb: "16px",
        }}
      >
        <Typography fontSize={18} fontWeight={400} color="var(--text-secondary)">
          Good morning,&nbsp;
          <Typography component="span" fontSize={18} fontWeight={600} color="var(--text-primary)">
            {user?.firstName || "Jonathan"}!
          </Typography>
        </Typography>

        <Select
          size="small"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          sx={{
            height: 32,
            fontSize: 14,
            minWidth: 140,
            backgroundColor: "var(--bg-surface)",
            ".MuiOutlinedInput-notchedOutline": { borderColor: "var(--border-card)" },
          }}
        >
          {PERIOD_OPTIONS.map((opt) => (
            <MenuItem key={opt.value} value={opt.value}>
              {opt.label}
            </MenuItem>
          ))}
        </Select>
      </Box>

      {/* STAT CARDS - period-filtered */}
      <Grid container spacing={2}>
        <FinanceStatsGrid totals={data.totals} />
      </Grid>

      {/* CHART (period-filtered) + COMPANIES (fixed, period-filtered invoice totals) */}
      <Grid container spacing={2} sx={{ mt: "0px" }}>
        <Grid item xs={12} md={8}>
          <FinanceOverviewCard trend={data.trend} periodLabel={data.period?.label} />
        </Grid>

        <Grid item xs={12} md={4}>
          <CompaniesCard companies={data.companies} />
        </Grid>
      </Grid>

      {/* MONEY MADE + INVESTMENT SUMMARY - all-time data, intentionally
          NOT affected by the period filter above. Both cards share the
          same explicit FINANCE_ROW_HEIGHT (see each component) so their
          bottoms always land on the same line regardless of how many
          employees are in the list - a scrollable table's natural content
          height can't be reliably matched to a sibling's height through
          CSS alone (stretch alignment sizes the row from content first,
          before any child's own scroll-clipping applies), so a shared
          fixed height is the deterministic fix rather than the source of
          the mismatch. */}
      <Grid container spacing={2} sx={{ mt: "0px" }}>
        <Grid item xs={12} md={8}>
          <MoneyMadeCard rows={data.moneyMade} />
        </Grid>

        <Grid item xs={12} md={4}>
          <InvestmentSummaryCard summary={data.investmentSummary} />
        </Grid>
      </Grid>

      {isLoading && (
        <Typography sx={{ mt: "16px", fontSize: 13, color: "var(--text-secondary)" }}>
          Loading finance data…
        </Typography>
      )}
    </Box>
  );
}

export default Finance;
