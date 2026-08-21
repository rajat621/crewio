import { Box, Typography } from "@mui/material";

function PageHeader({ name }) {
  return (
    <Box sx={{ mb: 3 }}>
      <Typography fontSize={18} color="var(--text-secondary)">
        Good morning,
        <Typography
          component="span"
          fontSize={18}
          fontWeight={600}
          color="var(--text-primary)"
          ml={0.5}
        >
          {name}!
        </Typography>
      </Typography>
    </Box>
  );
}

export default PageHeader;

