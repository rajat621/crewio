import { Chip } from "@mui/material";

const STATUS_STYLE = {
  active: {
    label: "Active",
    bg: "var(--bg-success-soft)",
    color: "#15803D",
  },
  deactivated: {
    label: "Deactivate",
    bg: "var(--bg-error-soft)",
    color: "var(--color-error)",
  },
};

function CompanyStatusChip({ status }) {
  const style = STATUS_STYLE[status];

  return (
    <Chip
      label={style.label}
      size="small"
      sx={{
        height: 24,
        fontSize: 12,
        bgcolor: style.bg,
        color: style.color,
        fontWeight: 500,
      }}
    />
  );
}

export default CompanyStatusChip;

