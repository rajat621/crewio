import { Box } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import ChatList from "../components/chat/ChatList";
import ChatDetail from "../components/chat/ChatDetail";

function Chat() {
  const location = useLocation();
  const preselectedChat = useMemo(() => {
    const chat = location.state?.selectedChat;
    if (!chat?.id) return null;

    return {
      unread: 0,
      timestamp: "Now",
      ...chat,
      id: String(chat.id),
    };
  }, [location.state]);
  const [selectedChat, setSelectedChat] = useState(preselectedChat);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (preselectedChat?.id) {
      setSelectedChat(preselectedChat);
    }
  }, [preselectedChat]);

  const handleBackToChat = () => {
    setSelectedChat(null);
  };

  const handleMessageSent = () => {
    setRefreshKey((prev) => prev + 1);
  };

  return (
    <Box
      sx={{
        display: "flex",
        height: "100%",
        width: "100%",
backgroundColor: "var(--bg-surface)",
border: "1px solid var(--border-card)",
        borderRadius: "12px",
        overflow: "hidden",
        gap: "0px",
      }}
    >
      {/* CHAT LIST SIDEBAR */}
      <ChatList
        selectedChat={selectedChat}
        onSelectChat={setSelectedChat}
        additionalChats={preselectedChat ? [preselectedChat] : []}
        refreshKey={refreshKey}
      />

      {/* CHAT DETAIL */}
      {selectedChat ? (
        <ChatDetail
          chat={selectedChat}
          onBack={handleBackToChat}
          onMessageSent={handleMessageSent}
        />
      ) : (
        <Box
          sx={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--text-secondary)",
            fontSize: 16,
            backgroundColor: "var(--bg-surface)",
          }}
        >
          Select a chat to start messaging
        </Box>
      )}
    </Box>
  );
}

export default Chat;

