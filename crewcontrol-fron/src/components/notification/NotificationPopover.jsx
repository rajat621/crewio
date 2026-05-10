import {
  Box,
  Typography,
  IconButton,
  Popover,
  Slide,
  Stack,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import NotificationItem from "./NotificationItem";

function NotificationPopover({ anchorEl, open, onClose }) {
  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{
        vertical: "bottom",
        horizontal: "right",
      }}
      transformOrigin={{
        vertical: "top",
        horizontal: "right",
      }}
      TransitionComponent={Slide}
      TransitionProps={{ direction: "left", timeout: 300 }} // standard MUI speed
      PaperProps={{
        sx: {
          mt: "4px", // ✅ 4px space from Topbar
          width: 370,
          height: 300,
          backgroundColor: "#FFFFFF",
          border: "1px solid #DEDEDE",
          borderRadius: 2,
          boxShadow:
            "0px 0px 2px 0px rgba(80, 92, 95, 0.2), 0px 6px 10px 0px rgba(0, 0, 0, 0.04)",
          px: 2, // 16px
          py: 2.5, // 20px
        },
      }}
    >
      {/* 🔹 HEADING SECTION */}
      <Box
        sx={{
          height: 28,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: 2, // 16px space to list
        }}
      >
        <Typography fontSize={18} fontWeight={600} color="#141414">
          Notification
        </Typography>

        <IconButton onClick={onClose} size="small">
          <CloseIcon sx={{ fontSize: 24, color: "#141414" }} />
        </IconButton>
      </Box>

      {/* 🔹 NOTIFICATION LIST */}
      <Stack spacing={1.5}>
        <NotificationItem
          type="passport"
          title="Passport expiry"
          description="Worker passport is expiring soon"
          time="1 min"
        />

        <NotificationItem
          type="absent"
          title="Labor absent"
          description="Worker marked absent today"
          time="15 min"
        />
      </Stack>
    </Popover>
  );
}

export default NotificationPopover;
