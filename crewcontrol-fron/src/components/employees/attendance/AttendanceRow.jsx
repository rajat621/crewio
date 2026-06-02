import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import { TableRow, TableCell, Chip } from "@mui/material";
import { EmployeeActionMenu } from "../../profile/EmployeeActionMenu";
import { CELL_SX } from "../../table/tableUtils";

const STATUS = {
  present: { label: "Present", bg: "#DCFCE7", color: "#15803D" },
  "on-leave": { label: "On Leave", bg: "#FEF3C7", color: "#92400E" },
  absent: { label: "Absent", bg: "#FECACA", color: "#DC2626" },
  late: { label: "Late", bg: "#E5E7EB", color: "#374151" },
};

export default function AttendanceRow({ row, columns, onViewProfile, onChat }) {
  const cfg = STATUS[row.attendanceStatus] || STATUS.absent;
  const actions = [
    {
      id: "view-profile",
      label: "View Profile",
      icon: <VisibilityOutlinedIcon fontSize="small" />,
      onClick: () => onViewProfile?.(row),
    },
    {
      id: "chat",
      label: "Chat",
      icon: <ChatBubbleOutlineIcon fontSize="small" />,
      onClick: () => onChat?.(row),
    },
  ];

  const getValue = (key) => {
    if (key === "attendanceStatus") {
      return (
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
      );
    }

    if (key === "action") {
      return <EmployeeActionMenu actions={actions} employeeId={row.id} />;
    }

    return row[key] ?? "-";
  };

  return (
    <TableRow sx={{ height: 44 }}>
      {columns.map((column) => (
        <TableCell key={column.key} align={column.align || "left"} sx={CELL_SX}>
          {getValue(column.key)}
        </TableCell>
      ))}
    </TableRow>
  );
}
