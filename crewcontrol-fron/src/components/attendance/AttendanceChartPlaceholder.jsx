//src\components\attendance\AttendanceChartPlaceholder.jsx
import { Box, Typography } from "@mui/material";

function AttendanceChartPlaceholder() {
  return (
    <Box
      sx={{
        height: 260,
        borderRadius: 2,
        backgroundColor: "#FFFFFF",
        border: "1px solid #DEDEDE",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Typography fontSize={13} color="#757575">
        Attendance chart will render here
      </Typography>
    </Box>
  );
}

export default AttendanceChartPlaceholder;
