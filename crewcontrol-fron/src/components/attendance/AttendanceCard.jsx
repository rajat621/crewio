//src\components\attendance\AttendanceCard.jsx
import { Box } from "@mui/material";
import { useState } from "react";
import AttendanceHeader from "./AttendanceHeader";
import AttendanceBarChart from "./AttendanceBarChart";

function AttendanceCard({ weeklyData = [], monthlyData = [] }) {
  const [view, setView] = useState("weekly"); // 🔑 state owner

  return (
    <Box
      sx={{
        width: "100%",
        height: 476,
        px: "16px",
        py: "20px",
        backgroundColor: "#FFFFFF",
        border: "1px solid #DEDEDE",
        borderRadius: "8px",
        boxShadow: "0px 0px 2px rgba(20, 20, 20, 0.12)",
      }}
    >
      <Box
        sx={{
          width: "100%",
          height: 436,
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        <AttendanceHeader value={view} onChange={setView} />

        <AttendanceBarChart view={view} weeklyData={weeklyData} monthlyData={monthlyData} />
      </Box>
    </Box>
  );
}

export default AttendanceCard;
