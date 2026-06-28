import React, { useState } from "react";
import { Box, Typography, IconButton, Popover } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import NotificationItem from "./NotificationItem";

function NotificationPopover({ anchorEl, open, onClose }) {
  const [notifications, setNotifications] = useState([
  {
    id: 1,
    type: "expiry",
    title: "Your Subscription Expire",
    description: "subscription plan expire in 3days",
    time: "1 min",
    unread: true,
  },
  {
    id: 2,
    type: "task",
    title: "01 Pending task",
    description: "Usability Testing",
    time: "15 min",
    unread: false,
  },
  {
    id: 3,
    type: "invoice",
    title: "Generate Tax Invoice",
    description: "You have to generate",
    time: "1 min",
    unread: true,
  },
]);

  const hasNotifications = notifications.length > 0;

  function markAllAsRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })));
  }

  function deleteAll() {
    setNotifications([]);
  }

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      transformOrigin={{ vertical: "top", horizontal: "right" }}
      PaperProps={{
        sx: {
          mt: "8px",
          display: "flex",
          width: 370,
          height: hasNotifications ? "auto" : 282,
          minHeight: hasNotifications ? "auto" : 282,
          maxHeight: hasNotifications ? "calc(100vh - 96px)" : 282,
          flexDirection: "column",
          alignItems: "flex-start",
          borderRadius: "8px",
          border: "1px solid var(--border-card)",
          background: "var(--bg-surface)",
          boxShadow: "var(--shadow-soft)",
          overflow: "hidden",
        },
      }}
    >
      <Box
        sx={{
          display: "flex",
          height: 64,
          minHeight: 64,
          padding: "20px 20px 16px 20px",
          justifyContent: "space-between",
          alignItems: "center",
          alignSelf: "stretch",
          boxSizing: "border-box",
        }}
      >
        <Typography
          sx={{
            fontSize: 18,
            fontWeight: 700,
            lineHeight: "24px",
            letterSpacing: "0.04em",
            color: "var(--text-primary)",
          }}
        >
          Notification
        </Typography>

        <IconButton
          onClick={onClose}
          size="small"
          sx={{
            width: 32,
            height: 32,
            color: "var(--text-primary)",
            "&:hover": {
              backgroundColor: "rgba(35, 32, 51, 0.06)",
            },
          }}
          aria-label="Close notifications"
        >
          <CloseIcon sx={{ fontSize: 24 }} />
        </IconButton>
      </Box>

      {hasNotifications ? (
        <>
          <Box
            sx={{
              width: "100%",
              px: "20px",
              pt: 0,
              pb: "16px",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              alignItems: "stretch",
              boxSizing: "border-box",
              overflowY: "auto",
              scrollbarWidth: "thin",
              scrollbarColor: "#D3D0DD transparent",
              "&::-webkit-scrollbar": {
                width: 6,
              },
              "&::-webkit-scrollbar-thumb": {
                backgroundColor: "#D3D0DD",
                borderRadius: "999px",
              },
              "&::-webkit-scrollbar-track": {
                backgroundColor: "transparent",
              },
            }}
          >
            {notifications.map((notification) => (
 <NotificationItem
  key={notification.id}
  type={notification.type}
  title={notification.title}
  description={notification.description}
  time={notification.time}
  unread={notification.unread}
/>
            ))}
          </Box>

          <Box
            sx={{
              display: "flex",
              height: 72,
              minHeight: 72,
              px: "48px",
              justifyContent: "space-between",
              alignItems: "center",
              alignSelf: "stretch",
              boxSizing: "border-box",
            }}
          >
            <Typography
              onClick={markAllAsRead}
              sx={{
                cursor: "pointer",
                color: "var(--text-primary)",
                fontSize: 15,
                fontWeight: 600,
                lineHeight: "22px",
              }}
            >
              Mark all as read
            </Typography>

            <Typography
              onClick={deleteAll}
              sx={{
                cursor: "pointer",
                color: "var(--color-error)",
                fontSize: 15,
                fontWeight: 600,
                lineHeight: "22px",
              }}
            >
              Delete all
            </Typography>
          </Box>
        </>
      ) : (
        <Box
          sx={{
            flex: 1,
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pb: "16px",
            boxSizing: "border-box",
          }}
        >
          <Typography
            sx={{
              fontSize: 15,
              fontWeight: 400,
              lineHeight: "20px",
              color: "var(--text-secondary)",
            }}
          >
            No Notification
          </Typography>
        </Box>
      )}
    </Popover>
  );
}

export default NotificationPopover;
