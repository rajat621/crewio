import { Chip } from "@mui/material";

const STATUS_STYLE = {
  active: {
    label: "Active",
    bg: "#DCFCE7",
    color: "#15803D",
  },
  deactivated: {
    label: "Deactivate",
    bg: "#FEE2E2",
    color: "#DC2626",
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
