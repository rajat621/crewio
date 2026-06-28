import { Button as MuiButton } from "@mui/material";

function Button({ variant = "primary", sx = {}, ...props }) {
  const styles = {
    primary: {
      bgcolor: "var(--color-primary)",
      color: "var(--color-primary-contrast)",
      "&:hover": { bgcolor: "var(--color-primary-hover)" },
      "&:active": { bgcolor: "var(--color-primary-active)" },
      "&:focus-visible": { outline: "none", boxShadow: "0 0 0 3px rgba(63, 103, 227, 0.28)" },
      "&.Mui-disabled": {
        bgcolor: "var(--bg-surface-tertiary)",
        color: "var(--text-disabled)",
      },
    },
    secondary: {
      bgcolor: "transparent",
      color: "var(--color-primary)",
      border: "1px solid var(--color-primary)",
      "&:hover": { bgcolor: "#EEF4FF" },
      "&:active": { bgcolor: "var(--bg-info-soft)" },
    },
  };

  return <MuiButton {...props} sx={{ textTransform: "none", borderRadius: "8px", ...styles[variant], ...sx }} />;
}

export default Button;

