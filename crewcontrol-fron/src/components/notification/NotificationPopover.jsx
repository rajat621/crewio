
import { useCallback, useEffect, useState } from "react";
import { Box, Typography, IconButton, Popover, CircularProgress } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import NotificationItem from "./NotificationItem";
import notificationsApi from "../../api/notifications";
import { useSocket } from "../../context/SocketContext";

// Every lifecycle event the backend fans out to a notification (see
// backend/src/services/lifecycle.service.js) - listening for these here
// keeps the popover's contents and the unread badge live without polling.
const LIFECYCLE_EVENTS = [
  "employee:assigned",
  "employee:unassigned",
  "employee:checked_in",
  "employee:started_work",
  "employee:stopped_work",
  "employee:leave_started",
  "employee:leave_ended",
  "employee:site_finished",
];

const formatRelativeTime = (isoDate) => {
  const date = new Date(isoDate);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay}d`;
};

// The backend doesn't tag a UI "type" (expiry/task/invoice) on these -
// derive a reasonable one from the notification's own payload so
// NotificationItem picks a sensible icon.
const inferType = (payload) => {
  const nType = payload?.notificationType;
  if (nType === "SITE_COMPLETED") return "task";
  return "task";
};

function NotificationPopover({ anchorEl, open, onClose }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const { socket } = useSocket();

  const load = useCallback(() => {
    setLoading(true);
    notificationsApi
      .listOwnerNotifications()
      .then((res) => {
        const items = res?.data?.data || [];
        setNotifications(
          items.map((n) => ({
            id: n._id,
            type: inferType(n.payload),
            title: n.title,
            description: n.body,
            time: formatRelativeTime(n.createdAt),
            unread: !n.read,
          }))
        );
      })
      .catch((err) => console.error("Failed to load notifications:", err?.response?.data || err.message))
      .finally(() => setLoading(false));
  }, []);

  // Load whenever the popover is opened.
  useEffect(() => {
    if (open) load();
  }, [open, load]);

  // Keep it live: any lifecycle event refreshes the list (and therefore the
  // unread badge) even while the popover is closed.
  useEffect(() => {
    if (!socket) return;
    const handler = () => load();
    LIFECYCLE_EVENTS.forEach((event) => socket.on(event, handler));
    return () => LIFECYCLE_EVENTS.forEach((event) => socket.off(event, handler));
  }, [socket, load]);

  const hasNotifications = notifications.length > 0;

  function markAllAsRead() {
    const unreadIds = notifications.filter((n) => n.unread).map((n) => n.id);
    setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })));
    unreadIds.forEach((id) => {
      notificationsApi.markRead(id).catch(() => {});
    });
  }

  function deleteAll() {
    const previous = notifications;
    setNotifications([]);
    notificationsApi.deleteAllOwnerNotifications().catch((err) => {
      console.error("Failed to delete notifications:", err?.response?.data || err.message);
      // Restore the list if the delete didn't actually persist, so the
      // person isn't misled into thinking it worked when it didn't.
      setNotifications(previous);
    });
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

      {loading ? (
        <Box sx={{ flex: 1, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", pb: "16px" }}>
          <CircularProgress size={24} />
        </Box>
      ) : hasNotifications ? (
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
              <Box
                key={notification.id}
                onClick={() => {
                  if (!notification.unread) return;
                  setNotifications((prev) =>
                    prev.map((n) => (n.id === notification.id ? { ...n, unread: false } : n))
                  );
                  notificationsApi.markRead(notification.id).catch(() => {});
                }}
                sx={{ cursor: "pointer" }}
              >
                <NotificationItem
                  type={notification.type}
                  title={notification.title}
                  description={notification.description}
                  time={notification.time}
                  unread={notification.unread}
                />
              </Box>
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
