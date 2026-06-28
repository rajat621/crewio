//src\components\attendance\AttendanceChartPlaceholder.jsx
import { Box, Typography } from "@mui/material";

function AttendanceChartPlaceholder() {
  return (
    <Box
      sx={{
        height: 260,
        borderRadius: 2,
        backgroundColor: "var(--bg-surface)",
        border: "1px solid var(--border-card)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Typography fontSize={13} color="var(--text-secondary)">
        Attendance chart will render here
      </Typography>
    </Box>
  );
}

export default AttendanceChartPlaceholder;

