import { TableRow, TableCell, Chip, IconButton } from "@mui/material";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import { CELL_SX } from "../../table/tableUtils";

const STATUS_CONFIG = {
  assigned: { label: "Assigned", bg: "#DCFCE7", color: "#15803D" },
  "ending-soon": { label: "Ending Soon", bg: "#E5E7EB", color: "#374151" },
  unassigned: { label: "Unassigned", bg: "#FECACA", color: "#DC2626" },
};

export default function AssignedRow({ row }) {
  const cfg = STATUS_CONFIG[row.assignedStatus] || STATUS_CONFIG.unassigned;

  return (
    <TableRow sx={{ height: 44 }}>
      <TableCell sx={CELL_SX}>{row.id}</TableCell>
      <TableCell sx={CELL_SX}>{row.name}</TableCell>
      <TableCell sx={CELL_SX}>{row.company}</TableCell>
      <TableCell sx={CELL_SX}>{row.project}</TableCell>
      <TableCell sx={CELL_SX}>{row.trade}</TableCell>
      <TableCell sx={CELL_SX}>{row.startDate}</TableCell>
      <TableCell sx={CELL_SX}>{row.rate}</TableCell>

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
