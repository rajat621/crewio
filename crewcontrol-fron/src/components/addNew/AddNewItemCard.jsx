import { Box, Typography } from "@mui/material";

function AddNewItemCard({ label, Icon, selected, disabled, onClick }) {
  return (
    <Box
      onClick={!disabled ? onClick : undefined}
      sx={{
        height: 160,
        width: "100%",
        px: "16px",
        py: "20px",
        borderRadius: "8px",
        border: "1px solid",
        borderColor: selected ? "var(--color-primary)" : "var(--border-card)",
        backgroundColor: "var(--bg-surface)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease",
        "&:hover": {
          borderColor: disabled ? "var(--border-card)" : selected ? "var(--color-primary)" : "var(--border-input-hover)",
          boxShadow: disabled ? "none" : "0 2px 6px var(--bg-info-soft)",
          transform: disabled ? "none" : "translateY(-1px)",
        },
      }}
    >
      {/* ICON CONTAINER */}
      <Box
        sx={{
          width: 108,
          height: 70,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Box
          sx={{
            width: 70,
            height: 70,
            borderRadius: "50%",
            backgroundColor: "var(--bg-info-soft)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {Icon ? <Icon sx={{ fontSize: 32, color: "var(--color-primary)" }} /> : null}
        </Box>
      </Box>

      {/* LABEL */}
      <Box
        sx={{
          width: "100%",
          height: 34,
          mt: "12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
        }}
      >
        <Typography
          fontSize={14}
          color={disabled ? "#B0B0B0" : "var(--text-secondary)"}
        >
          {label}
        </Typography>
      </Box>
    </Box>
  );
}

export default AddNewItemCard;

