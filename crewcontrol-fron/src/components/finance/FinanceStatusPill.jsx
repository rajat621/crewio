import { Chip } from "@mui/material";

const STATUS_STYLE = {
  active: { label: "Active", bg: "var(--bg-success-soft)", color: "#15803D" },
  inactive: { label: "Inactive", bg: "var(--bg-error-soft)", color: "var(--color-error)" },
};

function FinanceStatusPill({ status }) {
  const style = STATUS_STYLE[status] || STATUS_STYLE.inactive;

  return (
    <Chip
      label={style.label}
      size="small"
      sx={{
        height: 24,
        fontSize: 12,
        fontWeight: 500,
        bgcolor: style.bg,
        color: style.color,
      }}
    />
  );
}

export default FinanceStatusPill;
