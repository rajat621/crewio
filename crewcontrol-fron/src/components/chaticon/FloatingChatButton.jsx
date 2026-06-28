import { Box } from "@mui/material";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import { useNavigate } from "react-router-dom";

function FloatingChatButton({ onClick }) {
  const navigate = useNavigate();
  return (
    <Box
      onClick={() => navigate("/chat")}
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
      }}
    >
      <ChatBubbleOutlineIcon
        sx={{
          color: "var(--bg-surface)",
          fontSize: 26,
        }}
      />
    </Box>
  );
}

export default FloatingChatButton;

