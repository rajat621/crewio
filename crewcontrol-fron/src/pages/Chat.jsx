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
  const [localMessage, setLocalMessage] = useState(null);

  // Phase 3.12: stabilized - was an inline array literal recreated on
  // every render, which fed directly into ChatList's fetch-triggering
  // effect dependency array. Harmless before Phase 3.11 (Chat.jsx rarely
  // re-rendered), but became a real problem once localMessage (above)
  // started causing Chat.jsx to re-render on every message sent - the
  // fresh array reference would re-fire ChatList's full conversation +
  // 500-employee refetch on every send, silently reintroducing exactly
  // what the Phase 3.9 refreshKey removal was meant to eliminate.
  const additionalChats = useMemo(
    () => (preselectedChat ? [preselectedChat] : []),
    [preselectedChat]
  );

  useEffect(() => {
    if (preselectedChat?.id) {
      setSelectedChat(preselectedChat);
    }
  }, [preselectedChat]);

  const handleBackToChat = () => {
    setSelectedChat(null);
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
        additionalChats={additionalChats}
        localMessage={localMessage}
      />

      {/* CHAT DETAIL */}
      {selectedChat ? (
        <ChatDetail
          chat={selectedChat}
          onBack={handleBackToChat}
          onLocalMessage={setLocalMessage}
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

