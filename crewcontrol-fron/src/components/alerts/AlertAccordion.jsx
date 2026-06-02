import {
  Box,
  Typography,
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
          minHeight: 44,
          p: "12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: "pointer",
          backgroundColor: "#FFFFFF",
          "&:hover": {
            backgroundColor: "#F9FAFB",
          },
        }}
      >
        {/* LEFT */}
        <Box sx={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <KeyboardArrowRightIcon
            sx={{
              color: "#808080",
              fontSize: 20,
              transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
              transition: "0.2s",
            }}
          />
          <Typography
            sx={{
              fontSize: 14,
              fontWeight: 400,
              lineHeight: "20px",
              color: "#808080",
              whiteSpace: "nowrap",
            }}
          >
            {title}
          </Typography>
        </Box>

        {/* RIGHT (BADGE WITH PADDING) */}
        {count !== undefined && count !== null ? (
          <Box
            sx={{
              width: 28,
              display: "flex",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Box
              sx={{
                minWidth: 20,
                height: 20,
                px: "6px",
                borderRadius: "999px",
                backgroundColor: "#1D4ED8",
                color: "#FFFFFF",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                fontWeight: 600,
                lineHeight: "12px",
              }}
            >
              {count}
            </Box>
          </Box>
        ) : (
          <Box sx={{ width: 28, flexShrink: 0 }} />
        )}
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
                {item.meta ? (
                  <Typography
                    fontSize={10}
                    fontStyle="italic"
                    color="#757575"
                  >
                    {item.meta}
                  </Typography>
                ) : null}
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
