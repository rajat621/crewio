import { useEffect, useMemo, useRef, useState } from "react";
import { Box, CircularProgress, TextField, Typography } from "@mui/material";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import ArrowBackIosOutlinedIcon from "@mui/icons-material/ArrowBackIosOutlined";
import { useNavigate } from "react-router-dom";
import { chatApi } from "../../api/chat";
import { useAuth } from "../../context/AuthContext";
import { useSocket } from "../../context/SocketContext";

const formatTimestamp = (value) => {
  if (!value) return "Now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Now";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

// WhatsApp/Slack/Teams-style ordering: unread threads first, then most
// recent message, with everything else trailing behind by recency.
const sortConversations = (list) =>
  [...list].sort((a, b) => {
    const aUnread = a.unread > 0 ? 1 : 0;
    const bUnread = b.unread > 0 ? 1 : 0;
    if (aUnread !== bUnread) return bUnread - aUnread;
    return new Date(b.lastMessageTimestamp || 0) - new Date(a.lastMessageTimestamp || 0);
  });

// Extracted from what used to be inline in the socket handler's
// setConversations callback - same exact logic, now a standalone function
// so it can also be called from the local self-send path (see the effect
// further down) without duplicating this patch-or-add logic a second
// time. Behavior is byte-identical to the original inline version for
// the socket call site; the only change is that `employeeId`/
// `isIncoming`/`isOpenThread`/`previewText`/`createdAt`/`employeeName`
// are now parameters instead of closure variables.
const applyConversationUpdate = (prev, { employeeId, employeeName, previewText, createdAt, isIncoming, isOpenThread }) => {
  const existing = prev.find((c) => c.id === employeeId);
  const next = existing
    ? prev.map((c) =>
        c.id === employeeId
          ? {
              ...c,
              lastMessage: previewText || c.lastMessage,
              lastMessageTimestamp: createdAt || new Date().toISOString(),
              timestamp: formatTimestamp(createdAt),
              unread: isIncoming && !isOpenThread ? (c.unread || 0) + 1 : c.unread,
            }
          : c
      )
    : [
        ...prev,
        {
          id: employeeId,
          employeeId,
          name: employeeName || "Employee",
          lastMessage: previewText || "",
          lastMessageTimestamp: createdAt || new Date().toISOString(),
          timestamp: formatTimestamp(createdAt),
          unread: isIncoming && !isOpenThread ? 1 : 0,
        },
      ];
  return sortConversations(next);
};

function ChatList({ selectedChat, onSelectChat, additionalChats = [], localMessage = null }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { socket } = useSocket();
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [conversations, setConversations] = useState([]);
  const selectedChatIdRef = useRef(selectedChat?.id ? String(selectedChat.id) : null);

  // user.id only exists on the shape returned by login/signup; the
  // background session-revalidation call (AuthContext's fetchMe(), which
  // runs on every page load) replaces `user` with GET /api/auth/me's
  // shape, which only has Mongoose's `_id` - so `user?.id` alone silently
  // goes undefined a moment after mount. That made viewerId null here,
  // which broke the from-is-me check below and caused a sent message to
  // be attributed to the wrong conversation (a new "Employee" entry
  // instead of patching the real one) - reproduced live via the Chat UI.
  // Same fallback chain ChatDetail.jsx's currentUserIds already uses.
  const viewerId = useMemo(() => {
    const id = user?.id || user?._id || user?.userId || user?.employeeId;
    return id ? String(id) : null;
  }, [user]);

  useEffect(() => {
    selectedChatIdRef.current = selectedChat?.id ? String(selectedChat.id) : null;
  }, [selectedChat?.id]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        setLoading(true);
        setError("");

        // Threads that already have messages - the backend returns these
        // pre-sorted (unread-first, then latest) with real unread counts.
        const [conversationsRes, employeesRes] = await Promise.all([
          chatApi.getConversations(),
          chatApi.getEmployeesForChat({ page: 1, limit: 500 }),
        ]);

        const conversationRows = Array.isArray(conversationsRes?.data?.data) ? conversationsRes.data.data : [];
        const employees = Array.isArray(employeesRes?.data?.data)
          ? employeesRes.data.data
          : Array.isArray(employeesRes?.data?.employees)
            ? employeesRes.data.employees
            : [];

        const fromConversations = conversationRows.map((row) => ({
          id: String(row.employeeId),
          employeeId: row.employeeId,
          name: row.employeeName || "Employee",
          lastMessage: row.lastMessage || "No messages yet",
          lastMessageTimestamp: row.lastMessageTimestamp || row.lastMessageTime || null,
          timestamp: formatTimestamp(row.lastMessageTimestamp || row.lastMessageTime),
          unread: row.unreadCount || 0,
        }));

        const merged = new Map(fromConversations.map((chat) => [chat.id, chat]));

        // Employees with no message history yet still need to show up so a
        // new conversation can be started - just with an empty preview.
        employees.forEach((employee) => {
          const id = String(employee._id || employee.id || employee.employeeId || "");
          if (!id || merged.has(id)) return;
          merged.set(id, {
            id,
            employeeId: id,
            name:
              employee.name ||
              `${employee.firstName || ""} ${employee.lastName || ""}`.trim() ||
              employee.employeeId ||
              "Employee",
            lastMessage: "No messages yet",
            lastMessageTimestamp: null,
            timestamp: "Now",
            unread: 0,
          });
        });

        additionalChats.forEach((chat) => {
          if (!chat?.id) return;
          const id = String(chat.id);
          merged.set(id, {
            unread: 0,
            lastMessage: "No messages yet",
            timestamp: "Now",
            ...merged.get(id),
            ...chat,
            id,
          });
        });

        if (!active) return;
        setConversations(sortConversations(Array.from(merged.values())));
      } catch (err) {
        if (!active) return;
        setError(err?.response?.data?.message || "Failed to load conversations");
        setConversations([]);
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [additionalChats]);

  // Real-time updates: new messages move that thread to the top and bump
  // the unread badge instantly; read receipts clear it, all without a
  // page refresh or refetch.
  useEffect(() => {
    if (!socket) return undefined;

    const handleMessage = (payload) => {
      if (!payload) return;
      const from = String(payload.from || "");
      const to = String(payload.to || "");
      const employeeId = from === viewerId ? to : from;
      const isIncoming = to === viewerId;
      const isOpenThread = selectedChatIdRef.current === employeeId;
      // Voice notes carry no `text` - show a friendly label instead of an
      // empty/stale preview.
      const previewText = payload.messageType === "voice" ? "Voice message" : payload.text;

      setConversations((prev) =>
        applyConversationUpdate(prev, {
          employeeId,
          employeeName: payload.employeeName,
          previewText,
          createdAt: payload.createdAt,
          isIncoming,
          isOpenThread,
        })
      );
    };

    const handleRead = (payload) => {
      if (!payload?.employeeId) return;
      const employeeId = String(payload.employeeId);
      setConversations((prev) =>
        sortConversations(prev.map((c) => (c.id === employeeId ? { ...c, unread: 0 } : c)))
      );
    };

    socket.on("chat:message", handleMessage);
    socket.on("chat:read", handleRead);

    return () => {
      socket.off("chat:message", handleMessage);
      socket.off("chat:read", handleRead);
    };
  }, [socket, viewerId]);

  // Phase 3.11 correctness fix: the old refreshKey mechanism (removed in
  // Phase 3.9) was a full REST re-fetch, which worked regardless of
  // socket connectivity. The socket-only replacement is reliable when
  // the socket is connected (proven: the sender's dashboard connection
  // always joins backend/src/services/socket.service.js's
  // `dashboard:<ownerId>` room at connect time, and chat.controller.js
  // emits chat:message to exactly that room), but if the socket happens
  // to be disconnected/reconnecting at the exact moment of send, this
  // page's own conversation list would previously show a stale preview
  // until the socket recovers or the page remounts - a real gap the old
  // refreshKey didn't have, since it never depended on the socket at
  // all. This effect closes that gap the same way ChatDetail already
  // updates its own message view: using the data the send API call
  // already returned, not a refetch. If the socket ALSO delivers the
  // echo (the common case), this is a no-op in effect - patching the
  // same conversation by ID a second time with the same data is
  // idempotent, not a duplicate entry.
  useEffect(() => {
    if (!localMessage) return;
    const from = String(localMessage.from || "");
    const to = String(localMessage.to || "");
    const employeeId = from === viewerId ? to : from;
    if (!employeeId) return;

    setConversations((prev) =>
      applyConversationUpdate(prev, {
        employeeId,
        employeeName: localMessage.employeeName,
        previewText: localMessage.messageType === "voice" ? "Voice message" : localMessage.text,
        createdAt: localMessage.createdAt,
        isIncoming: false,
        isOpenThread: true,
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localMessage]);

  const filteredChats = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return conversations;
    return conversations.filter((chat) => String(chat.name || "").toLowerCase().includes(query));
  }, [conversations, searchQuery]);

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        width: 308,
        backgroundColor: "var(--bg-surface)",
        height: "100%",
        borderRight: "1px solid var(--border-card)",
      }}
    >
      <Box
        sx={{
          height: 64,
          display: "flex",
          alignItems: "center",
          padding: "16px",
          gap: "10px",
          backgroundColor: "var(--bg-surface-secondary)",
          borderBottom: "1px solid var(--border-card)",
        }}
      >
        <Box
          onClick={() => navigate("/")}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            cursor: "pointer",
            height: 44,
            padding: "16px",
            paddingLeft: 0,
          }}
        >
          <Box
            sx={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              cursor: "pointer",
              height: 32,
              width: 32,
              border: "1px solid var(--border-card)",
              borderRadius: "8px",
              paddingLeft: 0,
              backgroundColor: "transparent",
            }}
          >
            <ArrowBackIosOutlinedIcon sx={{ color: "var(--text-secondary)", fontSize: 14 }} />
          </Box>
          <Typography sx={{ fontSize: 16, fontFamily: "Inter", fontWeight: 500, color: "var(--text-primary)" }}>
            Chat
          </Typography>
        </Box>
      </Box>

      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          padding: "16px",
          paddingTop: "12px",
          paddingBottom: "24px",
          gap: "12px",
          minWidth: 0,
          backgroundColor: "var(--bg-surface-secondary)",
        }}
      >
        <TextField
          placeholder="Search employee name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          fullWidth
          size="small"
          inputProps={{ "aria-label": "Search employee name" }}
          sx={{
            "& .MuiOutlinedInput-root": {
              height: 36,
              backgroundColor: "var(--bg-surface)",
              border: "1px solid var(--border-card)",
              borderRadius: "8px",
              fontSize: 14,
              fontFamily: "Inter",
              "& fieldset": { borderColor: "transparent" },
              "&:hover fieldset": { borderColor: "transparent" },
              "&.Mui-focused fieldset": {
                borderColor: "var(--color-primary)",
                borderWidth: "1px",
              },
            },
            "& .MuiOutlinedInput-input::placeholder": {
              color: "var(--text-placeholder)",
              opacity: 1,
            },
          }}
        />

        <Box
          role="listbox"
          aria-label="Conversations"
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            flex: 1,
            overflowY: "auto",
            overflowX: "hidden",
            paddingRight: "2px",
            "&::-webkit-scrollbar": { width: "6px" },
            "&::-webkit-scrollbar-thumb": {
              backgroundColor: "var(--scrollbar-thumb)",
              borderRadius: "999px",
              "&:hover": { backgroundColor: "var(--scrollbar-thumb-hover)" },
            },
            "&::-webkit-scrollbar-track": { backgroundColor: "transparent" },
          }}
        >
          {loading ? (
            <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <CircularProgress size={22} />
            </Box>
          ) : error ? (
            <Box sx={{ p: 2, color: "var(--color-error)", fontSize: 14 }}>{error}</Box>
          ) : filteredChats.length ? (
            filteredChats.map((chat) => (
              <Box
                key={chat.id}
                role="option"
                aria-selected={selectedChat?.id === chat.id}
                tabIndex={0}
                onClick={() => onSelectChat(chat)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectChat(chat);
                  }
                }}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "8px",
                  cursor: "pointer",
                  backgroundColor: selectedChat?.id === chat.id ? "var(--bg-info-soft)" : "transparent",
                  borderRadius: "8px",
                  transition: "background-color 0.15s ease",
                  minHeight: 56,
                  "&:hover": {
                    backgroundColor:
                      selectedChat?.id === chat.id ? "var(--bg-info-soft)" : "var(--bg-surface-secondary)",
                  },
                  "&:focus-visible": {
                    outline: "2px solid var(--color-primary)",
                    outlineOffset: "-2px",
                  },
                }}
              >
                <AccountCircleIcon sx={{ width: 32, height: 32, color: "var(--text-secondary)" }} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    sx={{
                      fontSize: 14,
                      fontFamily: "Inter",
                      fontWeight: 500,
                      lineHeight: "20px",
                      color: "var(--text-primary)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {chat.name}
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: 12,
                      color: "var(--text-secondary)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {chat.lastMessage}
                  </Typography>
                </Box>
                {chat.unread > 0 ? (
                  <Box
                    role="status"
                    aria-label={`${chat.unread} unread message${chat.unread > 1 ? "s" : ""}`}
                    sx={{
                      minWidth: 20,
                      height: 20,
                      px: "6px",
                      borderRadius: "999px",
                      backgroundColor: "var(--color-primary)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 10,
                      color: "var(--bg-surface)",
                      fontWeight: 600,
                      flexShrink: 0,
                    }}
                  >
                    {chat.unread}
                  </Box>
                ) : null}
              </Box>
            ))
          ) : (
            <Box sx={{ p: 2, color: "var(--text-secondary)", fontSize: 14 }}>No conversations found.</Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}

export default ChatList;
