import { Box, Typography } from "@mui/material";

const EmployeesHeader = () => {
  return (
    <Box>
      <Typography
        sx={{ fontSize: "24px", fontWeight: 600 }}
      >
        Employees
      </Typography>
      <Typography
        sx={{ fontSize: "14px", color: "text.secondary" }}
      >
        Manage workforce and employment details
      </Typography>
    </Box>
  );
};

export default EmployeesHeader;
