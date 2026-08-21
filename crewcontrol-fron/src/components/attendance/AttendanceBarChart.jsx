// // src\\components\\attendance\\AttandanceBarCHart.jsx
// import {
//   ResponsiveContainer,
//   BarChart,
//   Bar,
//   XAxis,
//   YAxis,
//   Tooltip,
// } from "recharts";
// import { Box, Typography } from "@mui/material";

// const fallbackWeeklyData = [
//   { day: "Mon", present: 1, absent: 0 },
//   { day: "Tue", present: 2, absent: 1 },
//   { day: "Wed", present: 1, absent: 1 },
//   { day: "Thu", present: 3, absent: 1 },
//   { day: "Fri", present: 2, absent: 0 },
//   { day: "Sat", present: 1, absent: 1 },
//   { day: "Sun", present: 2, absent: 1 },
// ];

// const fallbackMonthlyData = [
//   { day: "Week 1", present: 8, absent: 2 },
//   { day: "Week 2", present: 9, absent: 3 },
//   { day: "Week 3", present: 7, absent: 2 },
//   { day: "Week 4", present: 10, absent: 2 },
//   { day: "Week 5", present: 6, absent: 1 },
// ];

// const hasVisibleBars = (items) =>
//   Array.isArray(items) &&
//   items.length > 0 &&
//   items.some((item) => Number(item?.present || 0) > 0 || Number(item?.absent || 0) > 0);

// function AttendanceBarChart({ view, weeklyData = [], monthlyData = [], hasEmployees = true }) {
//   if (!hasEmployees) {
//     return (
//       <Box
//         sx={{
//           width: "100%",
//           height: 360,
//           display: "flex",
//           alignItems: "center",
//           justifyContent: "center",
//           border: "1px solid var(--border-card)",
//           borderRadius: "4px",
//           p: "8px",
//         }}
//       >
//         <Box sx={{ color: "var(--text-secondary)", fontSize: 14 }}>No data</Box>
//       </Box>
//     );
//   }

//   const data = view === "monthly" ? monthlyData : weeklyData;

//   return (
//     <Box
//       sx={{
//         width: "100%",
//         height: 360,
//         border: "1px solid var(--border-card)",
//         borderRadius: "4px",
//         p: "8px",
//       }}
//     >
//       <ResponsiveContainer width="100%" height="100%">
//         <BarChart data={data} barCategoryGap={24}>
//           <XAxis dataKey="day" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
//           {/* Y-axis labels removed per request - bars already auto-scale to
//               the real present/absent counts for however many employees
//               actually exist (see buildWeeklyChartData/buildMonthlyChartData
//               in Home.jsx, which count real attendance records with no cap);
//               `hide` keeps that auto-scaling while just not drawing the
//               numeric ticks/axis line. */}
//           <YAxis hide allowDecimals={false} />
//           <Tooltip />

//           <Bar dataKey="present" stackId="a" fill="var(--color-primary)" />
//           <Bar dataKey="absent" stackId="a" fill="var(--bg-info-soft)" radius={[4, 4, 0, 0]} />
//         </BarChart>
//       </ResponsiveContainer>
//     </Box>
//   );
// }

// export default AttendanceBarChart;
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

// Exact colors requested: present = solid blue, absent = pale blue.
const PRESENT_COLOR = "#1D4ED8";
const ABSENT_COLOR = "#DBE2F9";

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

// Each bar is one stacked column: the real present-count segment (dark
// blue) and the real absent-count segment (pale blue) for that day/week -
// e.g. 10 employees, 4 present + 6 absent on Monday renders as a bar that's
// 40% dark blue / 60% pale blue, not two separate bars. Recharts' `stackId`
// on both <Bar> elements already does this proportionally from whatever
// counts are in `data` - if everyone was absent that day, `present` is 0
// and the whole bar renders as just the pale absent color, and vice versa.
function AttendanceTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;

  const present = Number(payload.find((p) => p.dataKey === "present")?.value || 0);
  const absent = Number(payload.find((p) => p.dataKey === "absent")?.value || 0);
  const total = present + absent;

  return (
    <Box
      sx={{
        backgroundColor: "var(--bg-surface)",
        border: "1px solid var(--border-card)",
        borderRadius: "8px",
        boxShadow: "0px 2px 8px rgba(20,20,20,0.12)",
        px: "12px",
        py: "10px",
        minWidth: 140,
      }}
    >
      <Typography sx={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", mb: "6px" }}>
        {label}
      </Typography>
      <Box sx={{ display: "flex", alignItems: "center", gap: "6px", mb: "4px" }}>
        <Box sx={{ width: 8, height: 8, borderRadius: "2px", backgroundColor: PRESENT_COLOR, flexShrink: 0 }} />
        <Typography sx={{ fontSize: 12, color: "var(--text-secondary)" }}>
          Present: <Typography component="span" sx={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>{present}</Typography>
        </Typography>
      </Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: "6px", mb: total ? "4px" : 0 }}>
        <Box sx={{ width: 8, height: 8, borderRadius: "2px", backgroundColor: ABSENT_COLOR, border: "1px solid #C7CDD8", flexShrink: 0 }} />
        <Typography sx={{ fontSize: 12, color: "var(--text-secondary)" }}>
          Absent: <Typography component="span" sx={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>{absent}</Typography>
        </Typography>
      </Box>
      {total ? (
        <Typography sx={{ fontSize: 11, color: "var(--text-secondary)", mt: "6px", pt: "6px", borderTop: "1px solid var(--border-card)" }}>
          Total: {total}
        </Typography>
      ) : null}
    </Box>
  );
}

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
          {/* Y-axis labels removed per request - bars already auto-scale to
              the real present/absent counts for however many employees
              actually exist (see buildWeeklyChartData/buildMonthlyChartData
              in Home.jsx, which count real attendance records with no cap);
              `hide` keeps that auto-scaling while just not drawing the
              numeric ticks/axis line. */}
          <YAxis hide allowDecimals={false} />
          {/* Neutral grey, not a blue tint - a blue-tinted hover highlight
              on a genuinely empty (e.g. future) day, which has no bar of
              its own, could look like a full-height "absent" bar even
              though there's no data for that day at all. */}
          <Tooltip content={<AttendanceTooltip />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />

          <Bar dataKey="present" stackId="a" fill={PRESENT_COLOR} />
          <Bar dataKey="absent" stackId="a" fill={ABSENT_COLOR} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );
}

export default AttendanceBarChart;