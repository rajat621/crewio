import { Box, Typography, Button } from "@mui/material";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";

function AlertContent({ items }) {
  return (
    <Box
      sx={{
        px: "12px",
        py: "12px",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
      }}
    >
      {items.map((item) => (
        <Box
          key={item}
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Typography fontSize={14} color="var(--text-secondary)">
            {item}
          </Typography>

          <Button
            size="small"
            startIcon={<ChatBubbleOutlineIcon />}
            sx={{
              textTransform: "none",
              fontSize: 12,
            }}
          >
            Chat
          </Button>
        </Box>
      ))}
    </Box>
  );
}

export default AlertContent;

