import { Box, Typography } from "@mui/material";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { formatCompactAmount } from "../../utils/financeFormat";

const INCOME_COLOR = "#3B5FE0";
const PROFIT_COLOR = "#8FA3EE";

function FinanceTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;

  const totalIncome = Number(payload.find((p) => p.dataKey === "totalIncome")?.value || 0);
  const netProfit = Number(payload.find((p) => p.dataKey === "netProfit")?.value || 0);

  return (
    <Box
      sx={{
        backgroundColor: "#1C1B29",
        borderRadius: "8px",
        boxShadow: "0px 4px 12px rgba(0,0,0,0.25)",
        px: "14px",
        py: "10px",
        minWidth: 150,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: "6px", mb: "6px" }}>
        <Box sx={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: INCOME_COLOR, flexShrink: 0 }} />
        <Typography sx={{ fontSize: 11, color: "rgba(255,255,255,0.72)" }}>Total Income</Typography>
      </Box>
      <Typography sx={{ fontSize: 16, fontWeight: 600, color: "#fff", mb: "10px" }}>
        {formatCompactAmount(totalIncome)}/AED
      </Typography>

      <Box sx={{ display: "flex", alignItems: "center", gap: "6px", mb: "6px" }}>
        <Box sx={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: PROFIT_COLOR, flexShrink: 0 }} />
        <Typography sx={{ fontSize: 11, color: "rgba(255,255,255,0.72)" }}>Net Profit</Typography>
      </Box>
      <Typography sx={{ fontSize: 16, fontWeight: 600, color: "#fff" }}>
        {formatCompactAmount(netProfit)}/AED
      </Typography>
    </Box>
  );
}

function FinanceOverviewChart({ data = [] }) {
  const hasData = data.some((row) => Number(row.totalIncome || 0) > 0 || Number(row.netProfit || 0) > 0);

  if (!hasData) {
    return (
      <Box
        sx={{
          width: "100%",
          height: 360,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Typography sx={{ color: "var(--text-secondary)", fontSize: 14 }}>No data</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ width: "100%", height: 360 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 20, right: 12, left: 12, bottom: 0 }}>
          <defs>
            <linearGradient id="financeIncomeGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={INCOME_COLOR} stopOpacity={0.28} />
              <stop offset="100%" stopColor={INCOME_COLOR} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="financeProfitGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={PROFIT_COLOR} stopOpacity={0.3} />
              <stop offset="100%" stopColor={PROFIT_COLOR} stopOpacity={0} />
            </linearGradient>
          </defs>

          <XAxis
            dataKey="label"
            tick={{ fontSize: 12, fill: "var(--text-secondary)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis hide />
          <Tooltip
            content={<FinanceTooltip />}
            cursor={{ stroke: "var(--border-card)", strokeWidth: 1, strokeDasharray: "4 4" }}
          />

          <Area
            type="monotone"
            dataKey="totalIncome"
            stroke={INCOME_COLOR}
            strokeWidth={2}
            fill="url(#financeIncomeGradient)"
            dot={false}
            activeDot={{ r: 5, fill: INCOME_COLOR, stroke: "#fff", strokeWidth: 2 }}
          />
          <Area
            type="monotone"
            dataKey="netProfit"
            stroke={PROFIT_COLOR}
            strokeWidth={2}
            fill="url(#financeProfitGradient)"
            dot={false}
            activeDot={{ r: 5, fill: PROFIT_COLOR, stroke: "#fff", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </Box>
  );
}

export default FinanceOverviewChart;
