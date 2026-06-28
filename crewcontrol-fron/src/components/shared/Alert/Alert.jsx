import { Alert as MuiAlert } from "@mui/material";

function Alert({ severity = "info", sx = {}, ...props }) {
  const palette = {
    success: { bg: "#EDF8F2", border: "#D8F0E3", color: "#1F8A55" },
    warning: { bg: "var(--bg-surface)7E8", border: "#FDECC8", color: "#A86500" },
    error: { bg: "var(--bg-surface)1F1", border: "#FFE0E0", color: "#B4232C" },
    info: { bg: "#EEF4FF", border: "var(--bg-info-soft)", color: "var(--color-primary)" },
  }[severity];

  return (
    <MuiAlert
      severity={severity}
      {...props}
      sx={{
        borderRadius: "8px",
        border: `1px solid ${palette.border}`,
        backgroundColor: palette.bg,
        color: palette.color,
        ...sx,
      }}
    />
  );
}

export default Alert;

