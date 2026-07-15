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

function AlertActionRow({ item, actionLabel, busyLabel, onAction, isBusy }) {
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
        disabled={isBusy}
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
          borderColor: isBusy ? "#B9C4D6" : "#2454D9",
          color: isBusy ? "#8A93A6" : "#2454D9",
          fontSize: 14,
          fontWeight: 600,
          lineHeight: "20px",
          textTransform: "none",
          backgroundColor: "transparent",
          "&:hover": {
            borderColor: isBusy ? "#B9C4D6" : "#2454D9",
            backgroundColor: isBusy ? "transparent" : "var(--bg-info-soft)",
          },
        }}
      >
        {isBusy ? (busyLabel || "...") : actionLabel}
      </Button>
    </Box>
  );
}

function AlertSection({ title, items, actionLabel, busyLabel, onAction, isItemBusy }) {
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
            busyLabel={busyLabel}
            onAction={onAction}
            isBusy={Boolean(isItemBusy?.(item))}
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
          px: "14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: "pointer",
          backgroundColor: "#FBFAFF",
          "&:hover": {
            backgroundColor: "#F7F5FD",
          },
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
          <KeyboardArrowRightIcon
            sx={{
              color: "#57517E",
              fontSize: 18,
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
              color: "#57517E",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {title}
          </Typography>
        </Box>

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
          {sections.map((section) => (
            <AlertSection
              key={section.title}
              title={section.title}
              items={section.items || []}
              actionLabel={section.actionLabel}
              busyLabel={section.busyLabel}
              onAction={section.onAction}
              isItemBusy={section.isItemBusy}
            />
          ))}
        </Box>
      </Collapse>
    </Box>
  );
}

export default AlertAccordion;