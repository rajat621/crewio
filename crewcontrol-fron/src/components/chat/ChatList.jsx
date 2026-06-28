import { useEffect, useMemo, useState } from "react";
import { Box, CircularProgress, TextField, Typography } from "@mui/material";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import ArrowBackIosOutlinedIcon from "@mui/icons-material/ArrowBackIosOutlined";
import { useNavigate } from "react-router-dom";
import { chatApi } from "../../api/chat";

const getMessageSummary = (messages = []) => {
  if (!messages.length) {
    return { lastMessage: "No messages yet", timestamp: "Now" };
  }

<<<<<<< HEAD
  const sorted = [...messages].sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
  const last = sorted[sorted.length - 1];
  return {
    lastMessage: last?.text || "No messages yet",
    timestamp: last?.createdAt ? new Date(last.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Now",
  };
};

function ChatList({ selectedChat, onSelectChat, additionalChats = [], refreshKey = 0 }) {
=======
function ChatList({ selectedChat, onSelectChat, onBack, additionalChats = [] }) {
  const [searchQuery, setSearchQuery] = useState("");
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [conversations, setConversations] = useState([]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        setLoading(true);
        setError("");

        const response = await chatApi.getEmployeesForChat({ page: 1, limit: 500 });
        const employees = Array.isArray(response?.data?.data)
          ? response.data.data
          : Array.isArray(response?.data?.employees)
            ? response.data.employees
            : [];

        const baseList = employees.map((employee) => ({
          id: String(employee._id || employee.id || employee.employeeId || ""),
          name: employee.name || `${employee.firstName || ""} ${employee.lastName || ""}`.trim() || employee.employeeId || "Employee",
          employeeId: employee._id || employee.id || employee.employeeId || "",
        })).filter((item) => item.id);

        const messageResults = await Promise.allSettled(
          baseList.map((item) => chatApi.getMessages(item.employeeId))
        );

        const merged = baseList.map((item, index) => {
          const result = messageResults[index];
          const messages = Array.isArray(result?.value?.data?.data)
            ? result.value.data.data
            : Array.isArray(result?.value?.data?.messages)
              ? result.value.data.messages
              : [];
          const summary = getMessageSummary(messages);
          return {
            ...item,
            unread: 0,
            ...summary,
          };
        });

        const mergedMap = new Map(merged.map((chat) => [String(chat.id), chat]));
        additionalChats.forEach((chat) => {
          if (!chat?.id) return;
          mergedMap.set(String(chat.id), {
            unread: 0,
            lastMessage: chat.lastMessage || "No messages yet",
            timestamp: chat.timestamp || "Now",
            ...chat,
          });
        });

        if (!active) return;
        setConversations(Array.from(mergedMap.values()));
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
  }, [additionalChats, refreshKey]);

  const mergedChats = useMemo(() => {
    const chatMap = new Map(mockChats.map((chat) => [String(chat.id), chat]));

    additionalChats.forEach((chat) => {
      if (!chat?.id) return;

      chatMap.set(String(chat.id), {
        lastMessage: "",
        timestamp: "Now",
        unread: 0,
        ...chat,
      });
    });

    return Array.from(chatMap.values());
  }, [additionalChats]);

  const filteredChats = useMemo(() => {
<<<<<<< HEAD
    const query = searchQuery.toLowerCase().trim();
    if (!query) return conversations;
    return conversations.filter((chat) => String(chat.name || "").toLowerCase().includes(query));
  }, [conversations, searchQuery]);
=======
    return mergedChats.filter((chat) =>
      chat.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [mergedChats, searchQuery]);
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0

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
                onClick={() => onSelectChat(chat)}
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
