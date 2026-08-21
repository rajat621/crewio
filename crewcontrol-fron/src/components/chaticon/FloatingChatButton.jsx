import { useEffect, useState, memo } from "react";
import { Box } from "@mui/material";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import { useNavigate } from "react-router-dom";
import { chatApi } from "../../api/chat";
import { useAuth } from "../../context/AuthContext";
import { useSocket } from "../../context/SocketContext";

function FloatingChatButton({ onClick }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { socket } = useSocket();
  const [totalUnread, setTotalUnread] = useState(0);

  // Baseline unread total on mount/route entry.
  useEffect(() => {
    let active = true;
    chatApi
      .getConversations()
      .then((res) => {
        if (!active) return;
        const rows = Array.isArray(res?.data?.data) ? res.data.data : [];
        const total = rows.reduce((sum, row) => sum + (row.unreadCount || 0), 0);
        setTotalUnread(total);
      })
      .catch(() => {
        if (active) setTotalUnread(0);
      });
    return () => {
      active = false;
    };
  }, []);

  // Live updates: new incoming messages bump the badge instantly; reading a
  // conversation (from this button, or from inside /chat) clears its share
  // of the total immediately - no polling, no refresh.
  useEffect(() => {
    if (!socket) return undefined;
    // user?.id alone goes undefined once AuthContext's background
    // fetchMe() replaces `user` with GET /api/auth/me's shape (Mongoose
    // `_id`, no `id`) - same bug class fixed in ChatList.jsx, reproduced
    // there live. Fallback chain matches ChatDetail.jsx's currentUserIds.
    const viewerId = String(user?.id || user?._id || user?.userId || user?.employeeId || "") || null;

    const handleMessage = (payload) => {
      const to = String(payload?.to || "");
      if (viewerId && to === viewerId) {
        setTotalUnread((prev) => prev + 1);
      }
    };

    const handleRead = () => {
      // A precise per-thread decrement would need to track counts per
      // employeeId here too; simplest correct approach is to resync the
      // total from the server, which is a single lightweight request.
      chatApi
        .getConversations()
        .then((res) => {
          const rows = Array.isArray(res?.data?.data) ? res.data.data : [];
          const total = rows.reduce((sum, row) => sum + (row.unreadCount || 0), 0);
          setTotalUnread(total);
        })
        .catch(() => {});
    };

    socket.on("chat:message", handleMessage);
    socket.on("chat:read", handleRead);
    return () => {
      socket.off("chat:message", handleMessage);
      socket.off("chat:read", handleRead);
    };
  }, [socket, user]);

  return (
    <Box
      role="button"
      tabIndex={0}
      aria-label={totalUnread > 0 ? `Open chat, ${totalUnread} unread messages` : "Open chat"}
      onClick={() => (onClick ? onClick() : navigate("/chat"))}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick ? onClick() : navigate("/chat");
        }
      }}
      sx={{
        position: "fixed",
        bottom: 40,
        right: 40,
        width: 56,
        height: 56,
        borderRadius: "50%",
        backgroundColor: "var(--color-primary)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        boxShadow:
          "0px 0px 2px 0px rgba(80, 92, 95, 0.2), 0px 6px 10px 0px var(--shadow-overlay)",
        zIndex: 1300, // above everything
        "&:hover": {
          backgroundColor: "var(--color-primary-hover)",
        },
        "&:focus-visible": {
          outline: "2px solid var(--color-primary)",
          outlineOffset: "3px",
        },
      }}
    >
      <ChatBubbleOutlineIcon
        sx={{
          color: "var(--bg-surface)",
          fontSize: 26,
        }}
      />
      {totalUnread > 0 && (
        <Box
          role="status"
          aria-hidden="true"
          sx={{
            position: "absolute",
            top: -2,
            right: -2,
            minWidth: 18,
            height: 18,
            px: "4px",
            borderRadius: "999px",
            backgroundColor: "var(--color-error, #E53E3E)",
            border: "2px solid var(--bg-surface)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 10,
            fontWeight: 700,
            color: "#fff",
            lineHeight: 1,
          }}
        >
          {totalUnread > 99 ? "99+" : totalUnread}
        </Box>
      )}
    </Box>
  );
}

export default memo(FloatingChatButton);
