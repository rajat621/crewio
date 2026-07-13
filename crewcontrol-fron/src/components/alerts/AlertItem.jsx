import { Box, Typography, Chip } from "@mui/material";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";

function AlertItem({ label, count }) {
  return (
    <Box
      sx={{
        height: 44,
        px: 2,
        borderRadius: 1,
        border: "1px solid var(--border-card)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        cursor: "pointer",
        "&:hover": {
          backgroundColor: "var(--bg-canvas)",
        },
      }}
    >
      {/* LEFT */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <ChevronRightIcon sx={{ fontSize: 18, color: "var(--text-secondary)" }} />
        <Typography fontSize={14} color="var(--text-secondary)">
          {label}
        </Typography>
      </Box>

      {/* RIGHT */}
      {count !== undefined && (
        <Chip
          label={count}
          size="small"
          sx={{
            backgroundColor: "var(--color-primary)",
            color: "var(--bg-surface)",
            fontSize: 12,
            height: 22,
          }}
        />
      )}
    </Box>
  );
}

export default AlertItem;

