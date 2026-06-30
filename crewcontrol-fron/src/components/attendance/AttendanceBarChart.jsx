// src\\components\\attendance\\AttandanceBarCHart.jsx
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { Box, Typography } from "@mui/material";

const fallbackWeeklyData = [
  { day: "Mon", present: 1, absent: 0 },
  { day: "Tue", present: 2, absent: 1 },
  { day: "Wed", present: 1, absent: 1 },
  { day: "Thu", present: 3, absent: 1 },
  { day: "Fri", present: 2, absent: 0 },
  { day: "Sat", present: 1, absent: 1 },
  { day: "Sun", present: 2, absent: 1 },
];

const fallbackMonthlyData = [
  { day: "Week 1", present: 8, absent: 2 },
  { day: "Week 2", present: 9, absent: 3 },
  { day: "Week 3", present: 7, absent: 2 },
  { day: "Week 4", present: 10, absent: 2 },
  { day: "Week 5", present: 6, absent: 1 },
];

const hasVisibleBars = (items) =>
  Array.isArray(items) &&
  items.length > 0 &&
  items.some((item) => Number(item?.present || 0) > 0 || Number(item?.absent || 0) > 0);

function AttendanceBarChart({ view, weeklyData = [], monthlyData = [], hasEmployees = true }) {
  if (!hasEmployees) {
    return (
      <Box
        sx={{
          width: "100%",
          height: 360,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1px solid var(--border-card)",
          borderRadius: "4px",
          p: "8px",
        }}
      >
        <Box sx={{ color: "var(--text-secondary)", fontSize: 14 }}>No data</Box>
      </Box>
    );
  }

  const data = view === "monthly" ? monthlyData : weeklyData;

  return (
    <Box
      sx={{
        width: "100%",
        height: 360,
        border: "1px solid var(--border-card)",
        borderRadius: "4px",
        p: "8px",
      }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barCategoryGap={24}>
          <XAxis dataKey="day" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis allowDecimals={false} axisLine={false} tickLine={false} width={28} />
          <Tooltip />

          <Bar dataKey="present" stackId="a" fill="var(--color-primary)" />
          <Bar dataKey="absent" stackId="a" fill="var(--bg-info-soft)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );
}

export default AttendanceBarChart;

