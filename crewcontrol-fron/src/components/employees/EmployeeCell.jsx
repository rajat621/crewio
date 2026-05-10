import { Avatar, Box, Typography } from "@mui/material";

const EmployeeCell = ({ name, employeeId, avatar }) => (
  <Box display="flex" alignItems="center" gap={1.5}>
    <Avatar sx={{ width: 32, height: 32 }} src={avatar || undefined}>
      {!avatar && name?.charAt(0)}
    </Avatar>
    <Box>
      <Typography variant="body2" fontWeight={500}>
        {name}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {employeeId}
      </Typography>
    </Box>
  </Box>
);

export default EmployeeCell;
