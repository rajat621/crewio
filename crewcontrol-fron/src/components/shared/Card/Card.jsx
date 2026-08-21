import { Box } from "@mui/material";

function Card({ sx = {}, ...props }) {
  return (
    <Box
      {...props}
      sx={{
        backgroundColor: "var(--bg-surface)",
        border: "1px solid var(--border-card)",
        borderRadius: "8px",
        boxShadow: "var(--shadow-soft)",
        ...sx,
      }}
    />
  );
}

export default Card;
