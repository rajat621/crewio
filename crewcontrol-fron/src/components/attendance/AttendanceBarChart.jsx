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

const hasVisibleBars = (items) =>
  Array.isArray(items) &&
  items.length > 0 &&
  items.some((item) => Number(item?.present || 0) > 0 || Number(item?.absent || 0) > 0);

function AttendanceBarChart({ view, weeklyData = [], monthlyData = [] }) {
  const sourceData = view === "monthly" ? monthlyData : weeklyData;
  const hasData = hasVisibleBars(sourceData);

  if (!hasData) {
    return (
      <Box
        sx={{
          width: "100%",
          height: 360,
          border: "1px solid #DEDEDE",
          borderRadius: "4px",
          p: "8px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Typography fontSize={13} color="#757575">
          No attendance data
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        width: "100%",
        height: 360,
        border: "1px solid #DEDEDE",
        borderRadius: "4px",
        p: "8px",
      }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={sourceData} barCategoryGap={24}>
          <XAxis dataKey="day" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis allowDecimals={false} axisLine={false} tickLine={false} width={28} />
          <Tooltip />

          <Bar dataKey="present" stackId="a" fill="#1D4ED8" />
          <Bar dataKey="absent" stackId="a" fill="#DBE2F9" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );
}

export default AttendanceBarChart;
