
import { useMemo } from "react";
import { Box, Typography, IconButton, Popover, CircularProgress } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import NotificationItem from "./NotificationItem";
import { useNotifications } from "../../hooks/useNotifications";
import {
  useMarkNotificationReadMutation,
  useMarkAllNotificationsReadMutation,
  useDeleteAllNotificationsMutation,
} from "../../hooks/mutations/useNotificationMutations";

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
  // useNotifications() is shared with the topbar's unread badge
  // (useUnreadNotifications) - both read the same cached query instead of
  // each fetching independently. isLoading is only true on the very first
  // load anywhere in the app (the badge hook is always mounted, so that
  // first fetch has typically already happened before this popover is
  // ever opened) - opening the popover reads already-fresh cached data
  // instead of triggering its own fetch, which is why there's no
  // "load on open" effect here anymore.
  const { data: rawNotifications = [], isLoading: loading } = useNotifications();

  const notifications = useMemo(
    () =>
      rawNotifications.map((n) => ({
        id: n._id,
        type: inferType(n.payload),
        title: n.title,
        description: n.body,
        time: formatRelativeTime(n.createdAt),
        unread: !n.read,
      })),
    [rawNotifications]
  );

  const markReadMutation = useMarkNotificationReadMutation();
  const markAllReadMutation = useMarkAllNotificationsReadMutation();
  const deleteAllMutation = useDeleteAllNotificationsMutation();

  const hasNotifications = notifications.length > 0;

  function markAllAsRead() {
    markAllReadMutation.mutate();
  }

  function deleteAll() {
    deleteAllMutation.mutate();
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
                  markReadMutation.mutate(notification.id);
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
