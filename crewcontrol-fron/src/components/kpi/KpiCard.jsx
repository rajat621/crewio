import { Box, Typography } from "@mui/material";

function KpiCard({
  icon,
  iconBg,
  iconColor,
  label,
  value,

  /* 🔽 NEW (OPTIONAL) */
  isClickable = false,
  isActive = false,
  onClick,
}) {
  return (
    <Box
      onClick={isClickable ? onClick : undefined}
      sx={{
        height: 110,
        width: "100%",
        px: "16px",
        py: "20px",
        backgroundColor: isActive ? "#F5F7FF" : "#FFFFFF",
        border: isActive
          ? "1px solid #1D4ED8"
          : "1px solid #DEDEDE",
        borderRadius: "8px",
        boxShadow: "0px 0px 2px rgba(20, 20, 20, 0.12)",
        cursor: isClickable ? "pointer" : "default",
        transition: "all 0.2s ease",

        "&:hover": isClickable
          ? {
              backgroundColor: "#F5F7FF",
            }
          : {},
      }}
    >
      {/* SECOND CONTAINER */}
      <Box
        sx={{
          height: 70,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {/* ICON */}
        <Box
          sx={{
            width: 70,
            height: 70,
            borderRadius: "50%",
            backgroundColor: iconBg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: iconColor,
          }}
        >
          {icon}
        </Box>

        {/* TEXT */}
        <Box
          sx={{
            height: 58,
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            justifyContent: "center",
            gap: "24px",
          }}
        >
          <Typography
            fontSize={16}
            color="#757575"
            textAlign="right"
            lineHeight="11px"
          >
            {label}
          </Typography>

          <Typography
            fontSize={32}
            fontWeight={600}
            color="#141414"
            textAlign="right"
            lineHeight="32px"
          >
            {value}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

export default KpiCard;
