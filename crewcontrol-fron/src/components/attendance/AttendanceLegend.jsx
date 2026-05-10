//src\components\attendance\AttendanceLegend.jsx
import { Box, Typography } from "@mui/material";

function LegendItem({ color, label }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <Box
        sx={{
          width: 12,
          height: 12,
          borderRadius: "50%",
          backgroundColor: color,
        }}
      />
      <Typography fontSize={14} color="#757575">
        {label}
      </Typography>
    </Box>
  );
}

function AttendanceLegend() {
  return (
    <Box
      sx={{
        height: 24,
        display: "flex",
        alignItems: "center",
        gap: "24px",
        mb: "12px",
      }}
    >
      <LegendItem color="#1D4ED8" label="Total present" />
      <LegendItem color="#DBE2F9" label="Total absent" />
    </Box>
  );
}

export default AttendanceLegend;
