import {
  Box,
  Typography,
  Collapse,
  Button,
} from "@mui/material";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";

function formatCount(count) {
  return String(count || 0).padStart(2, "0");
}

function AlertActionRow({ item, actionLabel, onAction }) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) 80px",
        alignItems: "center",
        columnGap: "16px",
        minHeight: 44,
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography
          sx={{
            fontSize: 14,
            fontWeight: 500,
            lineHeight: "20px",
            color: "#27243A",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={item.name}
        >
          {item.name}
        </Typography>
        {item.meta ? (
          <Typography
            sx={{
              mt: "2px",
              fontSize: 11,
              fontWeight: 400,
              lineHeight: "16px",
              color: "#57517E",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={item.meta}
          >
            {item.meta}
          </Typography>
        ) : null}
      </Box>

      <Button
        variant="outlined"
        onClick={(event) => {
          event.stopPropagation();
          onAction?.(item);
        }}
        sx={{
          width: 80,
          minWidth: 80,
          maxWidth: 80,
          height: 32,
          minHeight: 32,
          px: 0,
          borderRadius: "8px",
          borderColor: "#2454D9",
          color: "#2454D9",
          fontSize: 14,
          fontWeight: 600,
          lineHeight: "20px",
          textTransform: "none",
          backgroundColor: "transparent",
          "&:hover": {
            borderColor: "#2454D9",
            backgroundColor: "var(--bg-info-soft)",
          },
        }}
      >
        {actionLabel}
      </Button>
    </Box>
  );
}

function AlertSection({ title, items, actionLabel, onAction }) {
  if (!items.length) return null;

  return (
    <Box>
      <Typography
        sx={{
          fontSize: 15,
          fontWeight: 400,
          lineHeight: "22px",
          color: "#57517E",
        }}
      >
        {title} ({formatCount(items.length)})
      </Typography>
      <Box
        sx={{
          mt: "8px",
          pt: "12px",
          borderTop: "1px solid #E4E2ED",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
        }}
      >
        {items.map((item, index) => (
          <AlertActionRow
            key={`${item.name || "alert"}-${index}`}
            item={item}
            actionLabel={actionLabel}
            onAction={onAction}
          />
        ))}
      </Box>
    </Box>
  );
}

function AlertAccordion({
  title,
  count,
  isOpen,
  onToggle,
  sections = [],
}) {
  const showBadge = Number(count || 0) > 0;

  return (
    <Box
      sx={{
        border: "1px solid #E4E2ED",
        borderRadius: "8px",
        overflow: "hidden",
        backgroundColor: "#FBFAFF",
      }}
    >
      <Box
        onClick={onToggle}
        sx={{
          height: 44,
          minHeight: 44,
<<<<<<< HEAD
          px: "14px",
=======
          p: "12px",
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: "pointer",
<<<<<<< HEAD
          backgroundColor: "#FBFAFF",
=======
          backgroundColor: "#FFFFFF",
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
          "&:hover": {
            backgroundColor: "#F7F5FD",
          },
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
          <KeyboardArrowRightIcon
            sx={{
<<<<<<< HEAD
              color: "#57517E",
              fontSize: 18,
=======
              color: "#808080",
              fontSize: 20,
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
              transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
              transition: "0.2s",
              flexShrink: 0,
            }}
          />
          <Typography
            sx={{
              fontSize: 14,
              fontWeight: 400,
              lineHeight: "20px",
<<<<<<< HEAD
              color: "#57517E",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
=======
              color: "#808080",
              whiteSpace: "nowrap",
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
            }}
          >
            {title}
          </Typography>
        </Box>

<<<<<<< HEAD
        {showBadge ? (
          <Box
            sx={{
              minWidth: 22,
              height: 22,
              px: "6px",
              borderRadius: "999px",
              backgroundColor: "#2454D9",
              color: "var(--bg-surface)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              fontWeight: 700,
              lineHeight: "12px",
              flexShrink: 0,
              ml: "10px",
            }}
          >
            {count}
          </Box>
        ) : null}
=======
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
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
      </Box>

      <Collapse in={isOpen} timeout="auto" unmountOnExit>
        <Box
          sx={{
            px: "24px",
            pb: "18px",
            pt: "10px",
            display: "flex",
            flexDirection: "column",
            gap: "20px",
          }}
        >
<<<<<<< HEAD
          {sections.map((section) => (
            <AlertSection
              key={section.title}
              title={section.title}
              items={section.items || []}
              actionLabel={section.actionLabel}
              onAction={section.onAction}
            />
=======
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
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
          ))}
        </Box>
      </Collapse>
    </Box>
  );
}

export default AlertAccordion;

