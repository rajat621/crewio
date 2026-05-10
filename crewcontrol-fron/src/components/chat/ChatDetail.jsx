import { Box, Avatar, Typography, Popover, MenuItem } from "@mui/material";
import AccountCircleIcon from '@mui/icons-material/AccountCircle';

import ArrowBackIosOutlinedIcon from '@mui/icons-material/ArrowBackIosOutlined';
import MoreVertIcon from "@mui/icons-material/MoreVert";
import SendIcon from "@mui/icons-material/Send";
import MicIcon from "@mui/icons-material/Mic";
import AddIcon from "@mui/icons-material/Add";
import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { trackEmployees } from "../employees/track/trackEmployeeData";

// Mock messages for demo
const mockMessages = {
  1: [
    { id: 1, sender: "other", text: "Hi, how are you?", timestamp: "10:30 AM" },
    { id: 2, sender: "you", text: "I'm doing great! How about you?", timestamp: "10:32 AM" },
    { id: 3, sender: "other", text: "All good here. Let's catch up tomorrow", timestamp: "10:33 AM" },
    { id: 4, sender: "you", text: "Sure! What time works for you?", timestamp: "10:35 AM" },
    { id: 5, sender: "other", text: "How about 2 PM?", timestamp: "10:36 AM" },
    { id: 6, sender: "you", text: "Perfect! See you then", timestamp: "10:37 AM" },
    { id: 7, sender: "other", text: "See you tomorrow", timestamp: "4:56 PM" },
  ],
  2: [
    { id: 1, sender: "other", text: "Hi there!", timestamp: "2:00 PM" },
    { id: 2, sender: "you", text: "Hey! How are things?", timestamp: "2:05 PM" },
    { id: 3, sender: "other", text: "Thanks for the update", timestamp: "2:30 PM" },
  ],
  3: [
    { id: 1, sender: "you", text: "Hi Mike, got a minute?", timestamp: "1:00 PM" },
    { id: 2, sender: "other", text: "Sure, what's up?", timestamp: "1:05 PM" },
    { id: 3, sender: "you", text: "Need to discuss the project timeline", timestamp: "1:07 PM" },
    { id: 4, sender: "other", text: "Can we reschedule?", timestamp: "1:15 PM" },
  ],
};

function ChatDetail({ chat, onBack }) {
  const [messages, setMessages] = useState(mockMessages[chat.id] || []);
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef(null);
  const [anchorEl, setAnchorEl] = useState(null);
  const navigate = useNavigate();

  const handleMenuOpen = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleViewProfile = () => {
    handleMenuClose();
    navigate(`/employee/${chat.id}/profile`);
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

  const handleSendMessage = () => {
    if (inputValue.trim()) {
      const newMessage = {
        id: messages.length + 1,
        sender: "you",
        text: inputValue,
        timestamp: new Date().toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        }),
      };
      setMessages([...messages, newMessage]);
      setInputValue("");
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
        backgroundColor: "#F6F6F6",
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
          backgroundColor: "#F6F6F6",
          borderBottom: "1px solid #DEDEDE",
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
            paddingLeft: 0,
          }}
          onClick={onBack}
        >
          <Box
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
          <ArrowBackIosOutlinedIcon sx={{ color: "#808080", fontSize: 14 }} />
          </Box>
          <AccountCircleIcon
            sx={{
              width: 32,
              height: 32,
              color: "#808080",
            }}
          >
          </AccountCircleIcon>

          <Typography
            sx={{
              fontSize: 14,
              fontFamily: "Inter",
              fontWeight: 500,
              color: "#1D1D1E",
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
              backgroundColor: "#F5F5F7",
            },
          }}
        >
          <MoreVertIcon sx={{ color: "#757575", fontSize: 24 }} />
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
              boxShadow: "0px 0px 2px 0px rgba(80, 92, 95, 0.2), 0px 6px 10px 0px rgba(0, 0, 0, 0.04)",
              borderRadius: "8px",
              border: "1px solid #DEDEDE",
            },
          }}
        >
          <MenuItem
            onClick={handleViewProfile}
            sx={{
              fontSize: 14,
              fontFamily: "Inter",
              color: "#1D1D1E",
              padding: "12px 20px",
              "&:hover": {
                backgroundColor: "#F5F5F7",
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
              color: "#FF3B30",
              padding: "12px 20px",
              "&:hover": {
                backgroundColor: "#FFF5F5",
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
          backgroundColor: "#FFFFFF",
          "&::-webkit-scrollbar": {
            width: "8px",
          },
          "&::-webkit-scrollbar-thumb": {
            backgroundColor: "rgba(95, 95, 111, 0.32)",
            borderRadius: "999px",
            "&:hover": {
              backgroundColor: "rgba(95, 95, 111, 0.48)",
            },
          },
          "&::-webkit-scrollbar-track": {
            backgroundColor: "transparent",
          },
        }}
      >
        {messages.map((message) => (
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
                  backgroundColor: message.sender === "you" ? "#1D4ED8" : "#E8E8ED",
                  color: message.sender === "you" ? "#FFFFFF" : "#1D1D1E",
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
                  color: "#A8A8AD",
                  fontFamily: "Inter",
                  paddingX: "4px",
                  textAlign: message.sender === "you" ? "right" : "left",
                }}
              >
                {message.timestamp}
              </Typography>
            </Box>
          </Box>
        ))}
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
          backgroundColor: "#FFFFFF",
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
            backgroundColor: "#F6F6F6",
            border: "1px solid #DEDEDE",
            borderRadius: "8px",
            paddingX: "12px",
            gap: "8px",
            transition: "border-color 0.15s ease",
            "&:focus-within": {
              borderColor: "#1D4ED8",
            },
            "&:hover": {
              borderColor: "#E8E8ED",
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
              color: "#1D4ED8",
              padding: "4px",
              borderRadius: "6px",
              transition: "background-color 0.15s ease",
              "&:hover": {
                backgroundColor: "#F5F5F7",
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
              color: "#1D1D1E",
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
              color: "#1D4ED8",
              padding: "4px",
              borderRadius: "6px",
              transition: "background-color 0.15s ease",
              "&:hover": {
                backgroundColor: "#F5F5F7",
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
