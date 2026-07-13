import { TableRow, TableCell, Chip } from "@mui/material";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import LinkOffOutlinedIcon from "@mui/icons-material/LinkOffOutlined";
import AddLinkOutlinedIcon from "@mui/icons-material/AddLinkOutlined";
import { EmployeeActionMenu } from "../../profile/EmployeeActionMenu";
import { CELL_SX } from "../../table/tableUtils";

const STATUS_CONFIG = {
  'on-site': { label: 'Assigned (On-Site)', bg: 'var(--bg-success-soft)', color: '#15803D' },
  'on-hold': { label: 'Unassigned', bg: 'var(--bg-error-soft)', color: 'var(--color-error)' },
  'site-over': { label: 'Worker Site-Over', bg: 'var(--border-input)', color: 'var(--text-secondary)' },
};

export default function AssignedRow({ row, onViewProfile, onAssign, onUnassign, onReactivate }) {
  const cfg = STATUS_CONFIG[row.assignedStatus] || STATUS_CONFIG['on-hold'];

  const actions = [
    {
      id: "view-profile",
      label: "View Profile",
      icon: <VisibilityOutlinedIcon fontSize="small" />,
      onClick: () => onViewProfile?.(row),
    },
  ];

  // Three distinct cases per the assignment lifecycle spec:
  //  - on-site:   currently assigned -> can be Unassigned
  //  - on-hold:   never assigned / admin-unassigned -> Assign opens the
  //               company picker popup (no existing company to reuse)
  //  - site-over: employee finished their site but is still linked to that
  //               same company -> Site Assigned is a direct, no-popup
  //               re-activation (see onReactivate)
  if (row.assignedStatus === "on-site") {
    actions.push({
      id: "unassign",
      label: "Unassign",
      icon: <LinkOffOutlinedIcon fontSize="small" />,
      onClick: () => onUnassign?.(row),
    });
  } else if (row.assignedStatus === "site-over") {
    actions.push({
      id: "site-assigned",
      label: "Site Assigned",
      icon: <AddLinkOutlinedIcon fontSize="small" />,
      onClick: () => onReactivate?.(row),
    });
  } else {
    actions.push({
      id: "assign",
      label: "Assign",
      icon: <AddLinkOutlinedIcon fontSize="small" />,
      onClick: () => onAssign?.(row),
    });
  }

  return (
    <TableRow sx={{ height: 44 }}>
      <TableCell sx={CELL_SX}>{row.id}</TableCell>
      <TableCell sx={CELL_SX}>{row.name}</TableCell>
      <TableCell sx={CELL_SX}>{row.company}</TableCell>
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
        <EmployeeActionMenu actions={actions} employeeId={row.id} />
      </TableCell>
    </TableRow>
  );
}

