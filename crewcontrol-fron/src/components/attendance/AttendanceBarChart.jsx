<<<<<<< HEAD
﻿// src\\components\\attendance\\AttandanceBarCHart.jsx
=======
// src\\components\\attendance\\AttandanceBarCHart.jsx
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { Box, Typography } from "@mui/material";

<<<<<<< HEAD
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
=======
const hasVisibleBars = (items) =>
  Array.isArray(items) &&
  items.length > 0 &&
  items.some((item) => Number(item?.present || 0) > 0 || Number(item?.absent || 0) > 0);

function AttendanceBarChart({ view, weeklyData = [], monthlyData = [] }) {
  const sourceData = view === "monthly" ? monthlyData : weeklyData;
  const hasData = hasVisibleBars(sourceData);

  if (!hasData) {
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
    return (
      <Box
        sx={{
          width: "100%",
          height: 360,
<<<<<<< HEAD
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
=======
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
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0

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
<<<<<<< HEAD
        <BarChart data={data} barCategoryGap={24}>
=======
        <BarChart data={sourceData} barCategoryGap={24}>
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
          <XAxis dataKey="day" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis allowDecimals={false} axisLine={false} tickLine={false} width={28} />
          <Tooltip />

<<<<<<< HEAD
          <Bar dataKey="present" stackId="a" fill="var(--color-primary)" />
          <Bar dataKey="absent" stackId="a" fill="var(--bg-info-soft)" radius={[4, 4, 0, 0]} />
=======
          <Bar dataKey="present" stackId="a" fill="#1D4ED8" />
          <Bar dataKey="absent" stackId="a" fill="#DBE2F9" radius={[4, 4, 0, 0]} />
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );
}

export default AttendanceBarChart;

