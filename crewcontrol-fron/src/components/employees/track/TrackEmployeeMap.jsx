
import { Box } from "@mui/material";

function TrackEmployeeMap() {
  return (
    <Box
      sx={{
        height: "100%",          // ✅ matches parent
        borderRadius: 1,
        border: "1px solid",
        borderColor: "divider",
        overflow: "hidden",
      }}
    >
      <iframe
        title="Employee Map"
        src="https://maps.google.com/maps?q=Bangalore&t=&z=13&ie=UTF8&iwloc=&output=embed"
        style={{
          width: "100%",
          height: "100%",
          border: 0,
        }}
      />
    </Box>
  );
}

export default TrackEmployeeMap;
