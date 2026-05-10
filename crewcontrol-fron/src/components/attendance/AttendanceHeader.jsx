//src\components\attendance\AttendanceHeader.jsx
import { Box, Typography, MenuItem, Select } from "@mui/material";

function AttendanceHeader({ value, onChange }) {
  return (
    <Box
      sx={{
        width: "100%",
        height: 68,
        display: "flex",
        flexDirection: "column",
        gap: "12px",
      }}
    >
      {/* TITLE + DROPDOWN */}
      <Box
        sx={{
          height: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Typography fontSize={20} fontWeight={600} color="#141414">
          Attendance
        </Typography>

        <Select
          size="small"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          sx={{
            height: 32,
            fontSize: 14,
            ".MuiOutlinedInput-notchedOutline": {
              border: "none",
            },
          }}
        >
          <MenuItem value="weekly">Weekly</MenuItem>
          <MenuItem value="monthly">Monthly</MenuItem>
        </Select>
      </Box>

      {/* LEGEND */}
      <Box
        sx={{
          height: 24,
          display: "flex",
          alignItems: "center",
          gap: "24px",
        }}
      >
        <LegendItem color="#1D4ED8" label="Total present" />
        <LegendItem color="#DBE2F9" label="Total absent" />
      </Box>
    </Box>
  );
}

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

export default AttendanceHeader;
