import { Chip } from "@mui/material";

const STATUS_MAP = {
  active: { label: "Active", color: "success" },
  inactive: { label: "Inactive", color: "default" },
  "on-leave": { label: "On Leave", color: "warning" },
};

const StatusChip = ({ status }) => {
  const cfg = STATUS_MAP[status] || {
    label: "Unknown",
    color: "default",
  };

  return (
    <Chip
      size="small"
      label={cfg.label}
      color={cfg.color}
      sx={{ fontWeight: 500 }}
    />
  );
};

export default StatusChip;
