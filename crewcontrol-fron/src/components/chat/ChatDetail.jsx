import { Box, Typography, Popover, MenuItem, CircularProgress } from "@mui/material";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import ArrowBackIosOutlinedIcon from "@mui/icons-material/ArrowBackIosOutlined";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import SendIcon from "@mui/icons-material/Send";
import MicIcon from "@mui/icons-material/Mic";
import AddIcon from "@mui/icons-material/Add";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { chatApi } from "../../api/chat";

function formatTime(value) {
  if (!value) return "Now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Now";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function normalizeMessage(message, currentUserIds = []) {
  const fromId = String(message?.from || "");
  const isMine = currentUserIds.some((id) => id && String(id) === fromId);
  return {
    id: String(message?._id || message?.id || `${fromId}-${message?.createdAt || Date.now()}`),
    sender: isMine ? "you" : "other",
    text: message?.text || "",
    timestamp: formatTime(message?.createdAt),
  };
}

function ChatDetail({ chat, onBack, onMessageSent }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const messagesEndRef = useRef(null);
  const [anchorEl, setAnchorEl] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const currentUserIds = useMemo(() => {
    const ids = [user?._id, user?.userId, user?.employeeId, user?.ownerId].filter(Boolean);
    return Array.from(new Set(ids.map((id) => String(id))));
  }, [user]);

  const handleMenuOpen = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleViewProfile = () => {
    handleMenuClose();
    navigate(`/employees/${chat.id}`);
  };

  const handleDeleteChat = () => {
    handleMenuClose();
    onBack();
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    let active = true;

    const loadMessages = async () => {
      if (!chat?.id) {
        setMessages([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError("");
        const response = await chatApi.getMessages(chat.id);
        const list = Array.isArray(response?.data?.data)
          ? response.data.data
          : Array.isArray(response?.data?.messages)
            ? response.data.messages
            : [];
        const normalized = [...list]
          .reverse()
          .map((message) => normalizeMessage(message, currentUserIds));
        if (active) setMessages(normalized);
      } catch (err) {
        if (active) {
          setError(err?.response?.data?.message || "Failed to load chat messages");
          setMessages([]);
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    loadMessages();
    return () => {
      active = false;
    };
  }, [chat?.id, currentUserIds]);

  const handleSendMessage = async () => {
    const text = inputValue.trim();
    if (!text || !chat?.id) return;

    try {
      const response = await chatApi.sendMessage(chat.id, text);
      const saved = response?.data?.data || response?.data?.message || {};
      const nextMessage = normalizeMessage(
        {
          ...saved,
          from: user?._id || user?.userId || user?.employeeId,
          text,
          createdAt: saved?.createdAt || new Date().toISOString(),
        },
        currentUserIds
      );
      setMessages((prev) => [...prev, nextMessage]);
      setInputValue("");
      onMessageSent?.();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to send message");
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        backgroundColor: "var(--bg-surface-secondary)",
        height: "100%",
        borderLeft: "none",
        borderRight: "none",
      }}
    >
      {/* HEADER WITH BACK BUTTON, EMPLOYEE NAME, AND MENU */}
      <Box
        sx={{
          height: 64,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 32px",
          backgroundColor: "var(--bg-surface-secondary)",
          borderBottom: "1px solid var(--border-card)",
        }}
      >
        {/* BACK BUTTON WITH PROFILE AND NAME */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            cursor: "pointer",
            height: 44,
            padding: "16px",
            paddingLeft: "12px",
          }}
          onClick={onBack}
        >
          {/* <Box
            sx={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            cursor: "pointer",
            height: 32,
            width: 32,
            paddingLeft: 0,
            backgroundColor:"transparent",
          }}
          >
          <ArrowBackIosOutlinedIcon sx={{ color: "var(--text-secondary)", fontSize: 14 }} />
          </Box> */}
          <AccountCircleIcon
            sx={{
              width: 32,
              height: 32,
              color: "var(--text-secondary)",
            }}
          >
          </AccountCircleIcon>

          <Typography
            sx={{
              fontSize: 14,
              fontFamily: "Inter",
              fontWeight: 500,
              color: "var(--text-primary)",
            }}
          >
            {chat.name}
          </Typography>
        </Box>

        {/* 3-DOT MENU */}
        <Box
          onClick={handleMenuOpen}
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            padding: "8px",
            borderRadius: "8px",
            transition: "background-color 0.15s ease",
            "&:hover": {
              backgroundColor: "var(--bg-surface-secondary)",
            },
          }}
        >
          <MoreVertIcon sx={{ color: "var(--text-secondary)", fontSize: 24 }} />
        </Box>

        {/* MENU POPOVER */}
        <Popover
          open={Boolean(anchorEl)}
          anchorEl={anchorEl}
          onClose={handleMenuClose}
          anchorOrigin={{
            vertical: "bottom",
            horizontal: "right",
          }}
          transformOrigin={{
            vertical: "top",
            horizontal: "right",
          }}
          PaperProps={{
            sx: {
              boxShadow: "0px 0px 2px 0px rgba(80, 92, 95, 0.2), 0px 6px 10px 0px var(--shadow-overlay)",
              borderRadius: "8px",
              border: "1px solid var(--border-card)",
            },
          }}
        >
          <MenuItem
            onClick={handleViewProfile}
            sx={{
              fontSize: 14,
              fontFamily: "Inter",
              color: "var(--text-primary)",
              padding: "12px 20px",
              "&:hover": {
                backgroundColor: "var(--bg-surface-secondary)",
              },
            }}
          >
            View Profile
          </MenuItem>
          <MenuItem
            onClick={handleDeleteChat}
            sx={{
              fontSize: 14,
              fontFamily: "Inter",
              color: "var(--color-error)",
              padding: "12px 20px",
              "&:hover": {
                backgroundColor: "var(--bg-surface)5F5",
              },
            }}
          >
            Delete Chat
          </MenuItem>
        </Popover>
      </Box>

      {/* MESSAGES CONTAINER */}
      <Box
        sx={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          display: "flex",
          flexDirection: "column",
          paddingTop: "24px",
          paddingBottom: "24px",
          paddingLeft: "32px",
          paddingRight: "35px",
          gap: "12px",
          backgroundColor: "var(--bg-surface)",
          "&::-webkit-scrollbar": {
            width: "8px",
          },
          "&::-webkit-scrollbar-thumb": {
            backgroundColor: "var(--scrollbar-thumb)",
            borderRadius: "999px",
            "&:hover": {
              backgroundColor: "var(--scrollbar-thumb-hover)",
            },
          },
          "&::-webkit-scrollbar-track": {
            backgroundColor: "transparent",
          },
        }}
      >
        {loading ? (
          <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <CircularProgress size={24} />
          </Box>
        ) : error ? (
          <Box sx={{ p: 2, color: "var(--color-error)", fontSize: 14 }}>{error}</Box>
        ) : messages.length ? (
          messages.map((message) => (
            <Box
              key={message.id}
              sx={{
                display: "flex",
                justifyContent: message.sender === "you" ? "flex-end" : "flex-start",
              }}
            >
              <Box
                sx={{
                  maxWidth: "60%",
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                  backgroundColor: "transparent"
                }}
              >
                <Box
                  sx={{
                    backgroundColor: message.sender === "you" ? "var(--color-primary)" : "var(--bg-surface-tertiary)",
                    color: message.sender === "you" ? "var(--bg-surface)" : "var(--text-primary)",
                    padding: "8px 12px",
                    borderRadius: "8px",
                    fontSize: 14,
                    fontFamily: "Inter",
                    lineHeight: "20px",
                    wordWrap: "break-word",
                  }}
                >
                  {message.text}
                </Box>
                <Typography
                  sx={{
                    fontSize: 12,
                    color: "var(--text-placeholder)",
                    fontFamily: "Inter",
                    paddingX: "4px",
                    textAlign: message.sender === "you" ? "right" : "left",
                  }}
                >
                  {message.timestamp}
                </Typography>
              </Box>
            </Box>
          ))
        ) : (
          <Box sx={{ p: 2, color: "var(--text-secondary)", fontSize: 14 }}>No messages yet.</Box>
        )}
        <div ref={messagesEndRef} />
      </Box>

      {/* MESSAGE INPUT BOX - STICKY AT BOTTOM */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          paddingLeft: "32px",
          paddingRight: "32px",
          paddingTop: 0,
          paddingBottom: "16px",
          height: 52,
          backgroundColor: "var(--bg-surface)",
          position: "sticky",
          bottom: 0,
        }}
      >
        {/* INPUT FIELD WITH ICONS INSIDE */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            width: "100%",
            height: 52,
            backgroundColor: "var(--bg-surface-secondary)",
            border: "1px solid var(--border-card)",
            borderRadius: "8px",
            paddingX: "12px",
            gap: "8px",
            transition: "border-color 0.15s ease",
            "&:focus-within": {
              borderColor: "var(--color-primary)",
            },
            "&:hover": {
              borderColor: "var(--bg-surface-tertiary)",
            },
          }}
        >
          {/* + ICON INSIDE */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: "var(--color-primary)",
              padding: "4px",
              borderRadius: "6px",
              transition: "background-color 0.15s ease",
              "&:hover": {
                backgroundColor: "var(--bg-surface-secondary)",
              },
            }}
          >
            <AddIcon sx={{ fontSize: 20 }} />
          </Box>

          {/* TEXT INPUT */}
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type your message..."
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              backgroundColor: "transparent",
            fontSize: 14,
            fontFamily: "Inter",
            color: "var(--text-primary)",
            height: "100%",
            padding: 0,
            margin: 0,
          }}
        />

          {/* MIC / SEND ICON INSIDE - DYNAMIC */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: "var(--color-primary)",
              padding: "4px",
              borderRadius: "6px",
              transition: "background-color 0.15s ease",
              "&:hover": {
                backgroundColor: "var(--bg-surface-secondary)",
              },
            }}
            onClick={inputValue.trim() ? handleSendMessage : undefined}
          >
            {inputValue.trim() ? (
              <SendIcon sx={{ fontSize: 18 }} />
            ) : (
              <MicIcon sx={{ fontSize: 20 }} />
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

export default ChatDetail;

