import { Box } from "@mui/material";
import { useState } from "react";
import ChatList from "../components/chat/ChatList";
import ChatDetail from "../components/chat/ChatDetail";

function Chat() {
  const [selectedChat, setSelectedChat] = useState(null);

  const handleBackToChat = () => {
    setSelectedChat(null);
  };

  return (
    <Box
      sx={{
        display: "flex",
        height: "100%",
        width: "100%",
backgroundColor: "#FFFFFF",
border: "1px solid #DEDEDE",
        borderRadius: "12px",
        overflow: "hidden",
        gap: "0px",
      }}
    >
      {/* CHAT LIST SIDEBAR */}
      <ChatList
        selectedChat={selectedChat}
        onSelectChat={setSelectedChat}
      />

      {/* CHAT DETAIL */}
      {selectedChat ? (
        <ChatDetail
          chat={selectedChat}
          onBack={handleBackToChat}
        />
      ) : (
        <Box
          sx={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#767680",
            fontSize: 16,
            backgroundColor: "#FFFFFF",
          }}
        >
          Select a chat to start messaging
        </Box>
      )}
    </Box>
  );
}

export default Chat;
