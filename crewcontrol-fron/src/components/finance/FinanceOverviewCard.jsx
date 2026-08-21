import { Box, Typography } from "@mui/material";
import { memo } from "react";
import Card from "../shared/Card/Card";
import FinanceOverviewChart from "./FinanceOverviewChart";

function LegendItem({ color, label }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <Box sx={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: color }} />
      <Typography fontSize={14} color="var(--text-secondary)">
        {label}
      </Typography>
    </Box>
  );
}

function FinanceOverviewCard({ trend = [], periodLabel }) {
  return (
    <Card
      sx={{
        width: "100%",
        height: 476,
        px: "16px",
        py: "20px",
      }}
    >
      <Box sx={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", gap: "16px" }}>
        <Box sx={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <Typography fontSize={20} fontWeight={600} color="var(--text-primary)">
            Financial Overview
          </Typography>
          {periodLabel && (
            <Typography fontSize={13} color="var(--text-secondary)">
              {periodLabel}
            </Typography>
          )}
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", gap: "24px" }}>
          <LegendItem color="#3B5FE0" label="Total Income" />
          <LegendItem color="#8FA3EE" label="Net Profit" />
        </Box>

        <Box sx={{ flex: 1, minHeight: 0 }}>
          <FinanceOverviewChart data={trend} />
        </Box>
      </Box>
    </Card>
  );
}

export default memo(FinanceOverviewCard);
