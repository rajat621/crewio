import { Box } from "@mui/material";
import { Outlet } from "react-router-dom";
import FlowTopbar from "../components/topbar/FlowTopbar";

function FlowLayout() {
  return (
    <Box
      className="app-container"
      sx={{
        height: "100vh",
        backgroundColor: "#F7F8FC",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <FlowTopbar />

      {/* PAGE CONTENT */}
      <Box className="main-content" sx={{ flex: 1, scrollbarGutter: "stable" }}>
        <Outlet />
      </Box>
    </Box>
  );
}

export default FlowLayout;
