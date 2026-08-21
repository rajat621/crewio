import { Box, Typography } from "@mui/material";

function NotFound() {
  return (
    <Box
      sx={{
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Typography variant="h5">
        404 – Page Not Found
      </Typography>
    </Box>
  );
}

export default NotFound;
