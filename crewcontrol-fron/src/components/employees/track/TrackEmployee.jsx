
import { Box } from "@mui/material";
import TrackEmployeeTable from "./TrackEmployeeTable";
import TrackEmployeeMap from "./TrackEmployeeMap";

function TrackEmployee() {
  return (
    <Box
      sx={{
        bgcolor: "#FFFFFF",
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 1.5,
        p: "20px",
      height: 505, // 🔒 total card height
      }}
    >
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "420px 1fr",
          gap: "20px",
          height: 460, // ✅ ONLY height definition
          flex: 1,
        }}
      >
        <TrackEmployeeTable />
        <TrackEmployeeMap />
      </Box>
    </Box>
  );
}

export default TrackEmployee;

