import { TableRow, TableCell, Chip, IconButton } from "@mui/material";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import { CELL_SX } from "../../table/tableUtils";

const STATUS = {
  present: { label: "Present", bg: "#DCFCE7", color: "#15803D" },
  "on-leave": { label: "On Leave", bg: "#FEF3C7", color: "#92400E" },
  absent: { label: "Absent", bg: "#FECACA", color: "#DC2626" },
  late: { label: "Late", bg: "#E5E7EB", color: "#374151" },
};

export default function AttendanceRow({ row }) {
  const cfg = STATUS[row.attendanceStatus] || STATUS.absent;

  return (
    <TableRow sx={{ height: 44 }}>
      <TableCell sx={CELL_SX}>{row.id}</TableCell>
      <TableCell sx={CELL_SX}>{row.name}</TableCell>
      <TableCell sx={CELL_SX}>{row.checkIn}</TableCell>
      <TableCell sx={CELL_SX}>{row.checkOut}</TableCell>
      <TableCell sx={CELL_SX}>{row.totalWorks}</TableCell>
      <TableCell sx={CELL_SX}>{row.totalAbsent}</TableCell>

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
