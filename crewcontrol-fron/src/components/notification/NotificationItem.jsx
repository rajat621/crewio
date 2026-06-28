import { Box, Typography } from "@mui/material";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import AssignmentTurnedInRoundedIcon from "@mui/icons-material/AssignmentTurnedInRounded";
import ReceiptLongRoundedIcon from "@mui/icons-material/ReceiptLongRounded";

function NotificationItem({  type,title, description, time, unread = false }) {
  const iconMap = {
  expiry: <WarningAmberRoundedIcon sx={{ fontSize: 20 }} />,
  task: <AssignmentTurnedInRoundedIcon sx={{ fontSize: 20 }} />,
  invoice: <ReceiptLongRoundedIcon sx={{ fontSize: 20 }} />,
};

const icon = iconMap[type];

  return (
    <Box
      sx={{
        display: "flex",
        height: unread ? 64 : "auto",
        minHeight: unread ? 64 : 56,
        padding: "8px" ,
        justifyContent: "space-between",
        alignItems: "center",
        alignSelf: "stretch",
        borderRadius: unread ? "8px" : 0,
        border: unread ? "1px solid var(--border-card)" : "1px solid transparent",
        background: unread ? "var(--bg-surface-secondary)" : "transparent",
        boxSizing: "border-box",
      }}
    >
      <Box
        sx={{
          width: 44,
          height: 44,
          minWidth: 44,
          borderRadius: "8px",
          backgroundColor: unread ? "var(--bg-info-soft)" : "var(--bg-warning-soft)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          mr: "16px",
          flexShrink: 0,
        }}
      >
        <Box
          sx={{
            width: 26,
            height: 26,
            borderRadius: "999px",
            backgroundColor: unread ? "var(--bg-info-soft)" : "transparent",
            color: unread ? "var(--color-info)" : "var(--color-warning)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
        {icon}
        </Box>
      </Box>

      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography
          sx={{
            fontSize: 15,
            fontWeight: 600,
            lineHeight: "20px",
            color: "var(--text-primary)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
          title={title}
        >
          {title}
        </Typography>
        <Typography
          sx={{
            mt: "2px",
            fontSize: 13,
            fontWeight: 400,
            lineHeight: "18px",
            color: "var(--text-tertiary)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
          title={description}
        >
          {description}
        </Typography>
      </Box>

      <Typography
        sx={{
          ml: "12px",
          minWidth: 42,
          textAlign: "right",
          fontSize: 13,
          fontWeight: 400,
          lineHeight: "18px",
          color: "var(--text-secondary)",
          whiteSpace: "nowrap",
        }}
      >
        {time}
      </Typography>
    </Box>
  );
}

export default NotificationItem;
