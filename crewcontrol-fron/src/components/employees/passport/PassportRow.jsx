import {
  TableRow,
  TableCell,
  Chip,
  IconButton,
} from "@mui/material";
import MoreVertIcon from "@mui/icons-material/MoreVert";

import { CELL_SX } from "../../table/tableUtils";

const STATUS_CONFIG = {
  valid: {
    label: "Valid",
    bg: "#DCFCE7",
    color: "#15803D",
  },
  "expiring-soon": {
    label: "Expiring Soon",
    bg: "#FEF3C7",
    color: "#92400E",
  },
  expired: {
    label: "Expired",
    bg: "#FECACA",
    color: "#DC2626",
  },
};

function PassportRow({ row }) {
  const cfg = STATUS_CONFIG[row.passportStatus] || STATUS_CONFIG.expired;

  return (
    <TableRow sx={{ height: 44 }}>
      <TableCell sx={CELL_SX}>{row.id}</TableCell>
      <TableCell sx={CELL_SX}>{row.name}</TableCell>
      <TableCell sx={CELL_SX}>{row.passportNo}</TableCell>
      <TableCell sx={CELL_SX}>{row.passportExpiry}</TableCell>

      <TableCell align="center" sx={CELL_SX}>
        <Chip
          label={cfg.label}
          sx={{
            height: 24,
            px: 1.5,
            fontSize: 12,
            bgcolor: cfg.bg,
            color: cfg.color,
          }}
        />
      </TableCell>

      <TableCell align="center" sx={CELL_SX}>
        <IconButton size="small">
          <MoreVertIcon fontSize="small" />
        </IconButton>
      </TableCell>
    </TableRow>
  );
}

export default PassportRow;
