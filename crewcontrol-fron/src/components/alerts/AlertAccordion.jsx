import {
  Box,
  Typography,
  Badge,
  Collapse,
  IconButton,
  Button,
} from "@mui/material";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";

function AlertAccordion({
  title,
  count,
  isOpen,
  onToggle,
  items,
  type,
}) {
  return (
    /* 🔹 ONE EXPANDING CONTAINER */
    <Box
      sx={{
        border: "1px solid #DEDEDE",
        borderRadius: "8px",
        overflow: "hidden",
      }}
    >
      {/* HEADER */}
      <Box
        onClick={onToggle}
        sx={{
          height: 44,
          p: "12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: "pointer",
          "&:hover": {
            backgroundColor: "#F9FAFB",
          },
        }}
      >
        {/* LEFT */}
        <Box sx={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <KeyboardArrowRightIcon
            sx={{
              fontSize: 20,
              transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
              transition: "0.2s",
            }}
          />
          <Typography fontSize={14} color="#141414">
            {title}
          </Typography>
        </Box>

        {/* RIGHT (BADGE WITH PADDING) */}
        <Box sx={{ pr: "4px" }}>
          <Badge
            badgeContent={count}
            sx={{
              "& .MuiBadge-badge": {
                backgroundColor: "#1D4ED8",
                color: "#FFFFFF",
              },
            }}
          />
        </Box>
      </Box>

      {/* EXPANDED CONTENT */}
      <Collapse in={isOpen} timeout="auto" unmountOnExit>
        <Box
          sx={{
            px: "12px",
            py: "12px",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          {items.map((item, index) => (
            <Box
              key={index}
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              {/* LEFT TEXT */}
              <Box sx={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <Typography fontSize={14} color="#141414">
                  {item.name}
                </Typography>
                <Typography
                  fontSize={8}
                  fontStyle="italic"
                  color="#757575"
                >
                  {item.meta}
                </Typography>
              </Box>

              {/* RIGHT ACTION */}
              {type === "absent" && (
                <IconButton size="small">
                  <ChatBubbleOutlineIcon fontSize="small" />
                </IconButton>
              )}

              {type === "tax" && (
                <Button size="small" variant="outlined">
                  Generate Invoice
                </Button>
              )}

              {type === "passport" && (
                <Button size="small" variant="outlined">
                  View Profile
                </Button>
              )}
            </Box>
          ))}
        </Box>
      </Collapse>
    </Box>
  );
}

export default AlertAccordion;
