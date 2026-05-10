import { Box, Typography } from "@mui/material";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import PersonOffOutlinedIcon from "@mui/icons-material/PersonOffOutlined";

const ICON_MAP = {
  passport: {
    icon: <ErrorOutlineIcon />,
    bg: "#FFF4E5",
    color: "#F59E0B",
  },
  absent: {
    icon: <PersonOffOutlinedIcon />,
    bg: "#EEF2FF",
    color: "#1D4ED8",
  },
};

function NotificationItem({ type, title, description, time }) {
  const config = ICON_MAP[type];

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "flex-start",
        gap: 1.5,
      }}
    >
      {/* ICON CONTAINER */}
      <Box
        sx={{
          width: 36,
          height: 36,
          borderRadius: 2,
          backgroundColor: config.bg,
          color: config.color,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {config.icon}
      </Box>

      {/* TEXT CONTENT */}
      <Box sx={{ flexGrow: 1 }}>
        <Typography fontSize={14} fontWeight={500} color="#141414">
          {title}
        </Typography>
        <Typography fontSize={12} color="#757575">
          {description}
        </Typography>
      </Box>

      {/* TIME */}
      <Typography fontSize={12} color="#757575">
        {time}
      </Typography>
    </Box>
  );
}

export default NotificationItem;
