import { Box, Typography, Chip } from "@mui/material";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";

function AlertItem({ label, count }) {
  return (
    <Box
      sx={{
        height: 44,
        px: 2,
        borderRadius: 1,
        border: "1px solid #DEDEDE",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        cursor: "pointer",
        "&:hover": {
          backgroundColor: "#F6F7FB",
        },
      }}
    >
      {/* LEFT */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <ChevronRightIcon sx={{ fontSize: 18, color: "#757575" }} />
        <Typography fontSize={14} color="#757575">
          {label}
        </Typography>
      </Box>

      {/* RIGHT */}
      {count !== undefined && (
        <Chip
          label={count}
          size="small"
          sx={{
            backgroundColor: "#1D4ED8",
            color: "#FFFFFF",
            fontSize: 12,
            height: 22,
          }}
        />
      )}
    </Box>
  );
}

export default AlertItem;
