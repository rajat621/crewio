import { Box, TextField,Typography } from "@mui/material";
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import ArrowBackIosOutlinedIcon from '@mui/icons-material/ArrowBackIosOutlined';
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";

// Mock data
const mockChats = [
  {
    id: 1,
    name: "John Doe",
    avatar: "JD",
    lastMessage: "See you tomorrow",
    timestamp: "4:56 pm",
    unread: 1,
  },
  {
    id: 2,
    name: "Jane Smith",
    avatar: "JS",
    lastMessage: "Thanks for the update",
    timestamp: "2:30 pm",
    unread: 0,
  },
  {
    id: 3,
    name: "Mike Johnson",
    avatar: "MJ",
    lastMessage: "Can we reschedule?",
    timestamp: "1:15 pm",
    unread: 2,
  },
  {
    id: 4,
    name: "Sarah Williams",
    avatar: "SW",
    lastMessage: "Perfect! See you soon",
    timestamp: "10:45 am",
    unread: 0,
  },
  {
    id: 5,
    name: "David Brown",
    avatar: "DB",
    lastMessage: "Thanks for the files",
    timestamp: "9:30 am",
    unread: 0,
  },
  {
    id: 6,
    name: "Emily Davis",
    avatar: "ED",
    lastMessage: "Let me check and get back",
    timestamp: "Yesterday",
    unread: 0,
  },
  {
    id: 7,
    name: "Alex Martinez",
    avatar: "AM",
    lastMessage: "All set for tomorrow",
    timestamp: "Yesterday",
    unread: 0,
  },
  {
    id: 8,
    name: "Lisa Anderson",
    avatar: "LA",
    lastMessage: "Great work on the project",
    timestamp: "2 days ago",
    unread: 0,
  },
];

function ChatList({ selectedChat, onSelectChat, onBack }) {
  const [searchQuery, setSearchQuery] = useState("");
  const navigate = useNavigate();

  const filteredChats = useMemo(() => {
    return mockChats.filter((chat) =>
      chat.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery]);

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        width: 308,
        backgroundColor: "#FFFFFF",
        height: "100%",
        borderLeft: "none",
        borderRight: "1px solid #DEDEDE",
    
    }}
    >
      {/* HEADER WITH BACK BUTTON AND TITLE */}
      <Box
        sx={{
          height: 64,
          display: "flex",
          alignItems: "center",
          padding: "16px",
          gap: "10px",
          backgroundColor: "#F6F6F6",
          borderBottom: "1px solid #DEDEDE", //bottom border for separation between list and chat header box
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
            border: "1px solid #DEDEDE", //border of arror box in list next to chat 
            borderRadius: "8px",
            paddingLeft: 0,
            backgroundColor:"transparent",
          }}
          >
          <ArrowBackIosOutlinedIcon sx={{ color: "#808080", fontSize: 14 }} />
          </Box>
          <Typography
            sx={{
              fontSize: 16,
              fontFamily: "Inter",
              fontWeight: 500,
              color: "#141414",
            }}
          >
            Chat
          </Typography>
        </Box>
      </Box>

      {/* SEARCH BAR AND CHAT LIST CONTAINER */}
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
          backgroundColor: "#F6F6F6",
          
        }}
      >
        {/* SEARCH BAR */}
        <TextField
          placeholder="Search employee name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          fullWidth
          size="small"
          sx={{
            "& .MuiOutlinedInput-root": {
              height: 36,
              backgroundColor: "#FFFFFF",
              border: "1px solid #DEDEDE",
              borderRadius: "8px",
              fontSize: 14,
              fontFamily: "Inter",
              "& fieldset": {
                borderColor: "transparent",
              },
              "&:hover fieldset": {
                borderColor: "transparent",
              },
              "&.Mui-focused fieldset": {
                borderColor: "#1D4ED8",
                borderWidth: "1px",
              },
            },
            "& .MuiOutlinedInput-input::placeholder": {
              color: "#C7C7CC",
              opacity: 1,
            },
          }}
        />

        {/* CHAT LIST - SCROLLABLE */}
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            flex: 1,
            overflowY: "auto",
            overflowX: "hidden",
            paddingRight: "2px",
            "&::-webkit-scrollbar": {
              width: "6px",
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
          {filteredChats.map((chat) => (
            <Box
              key={chat.id}
              onClick={() => onSelectChat(chat)}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "6px 8px 6px 8px",
                cursor: "pointer",
                backgroundColor:
                  selectedChat?.id === chat.id ? "#E3E9FA" : "transparent",
                borderRadius: "8px",
                transition: "background-color 0.15s ease",
                height: 44,
                "&:hover": {
                  backgroundColor:
                    selectedChat?.id === chat.id ? "#E3E9FA" : "#F5F5F7",
                },
              }}
            >
              {/* AVATAR */}
          <AccountCircleIcon
            sx={{
              width: 32,
              height: 32,
              color: "#808080",
            }}
          >
          </AccountCircleIcon>
              {/* <Avatar
                sx={{
                  width: 32,
                  height: 32,
                  backgroundColor: "#4D67EB",
                  fontSize: 12,
                  fontFamily: "Inter",
                  fontWeight: 600,
                  color: "#FFFFFF",
                  flexShrink: 0,
                }}
              >
                {chat.avatar}
              </Avatar> */}

              {/* CHAT INFO */}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography
                  sx={{
                    fontSize: 14,   
                    fontFamily: "Inter",
                    fontWeight: 400,
                    letterSpacing: "2%",
                    lineHeight: "20px",
                    color: "#767680",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {chat.name}
                </Typography>
              </Box>

              {/* UNREAD BADGE */}
              {chat.unread > 0 && (
                <Box
                  sx={{
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    backgroundColor: "#1D4ED8",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 10,
                    color: "#FFFFFF",
                    fontWeight: 600,
                    flexShrink: 0,
                  }}
                >
                  {chat.unread}
                </Box>
              )}
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}

export default ChatList;
