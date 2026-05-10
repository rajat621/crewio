// src\components\attendance\AttandanceBarCHart.jsx
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  Tooltip,
} from "recharts";
import { Box } from "@mui/material";

/* 🔹 DATA SETS */
const weeklyData = [
  { day: "Mon", present: 12, absent: 3 },
  { day: "Tue", present: 13, absent: 2 },
  { day: "Wed", present: 14, absent: 1 },
  { day: "Thu", present: 13, absent: 2 },
  { day: "Fri", present: 12, absent: 3 },
  { day: "Sat", present: 11, absent: 4 },
  { day: "Sun", present: 10, absent: 5 },
];

const monthlyData = [
  { day: "Week 1", present: 70, absent: 10 },
  { day: "Week 2", present: 72, absent: 8 },
  { day: "Week 3", present: 68, absent: 12 },
  { day: "Week 4", present: 75, absent: 5 },
];

function AttendanceBarChart({ view }) {
  const data = view === "monthly" ? monthlyData : weeklyData;

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
        <BarChart data={data} barCategoryGap={24}>
          <XAxis
            dataKey="day"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 14, fill: "#757575" }}
          />

          <Tooltip
            cursor={{ fill: "rgba(0,0,0,0.04)" }}
            contentStyle={{
              borderRadius: 4,
              fontSize: 12,
            }}
            formatter={(value, name) => [
              value,
              name === "present" ? "Present" : "Absent",
            ]}
          />

          {/* PRESENT */}
          <Bar dataKey="present" stackId="a" fill="#1D4ED8" />

          {/* ABSENT */}
          <Bar
            dataKey="absent"
            stackId="a"
            fill="#DBE2F9"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );
}

export default AttendanceBarChart;
