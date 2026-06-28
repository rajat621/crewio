<<<<<<< HEAD
﻿import { TableRow, TableCell, Chip } from "@mui/material";
=======
import { TableRow, TableCell, Chip } from "@mui/material";
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
import { useNavigate } from "react-router-dom";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";

import { ACTION_CELL_SX, CELL_SX } from "../../table/tableUtils";
import { EmployeeActionMenu } from "../../profile/EmployeeActionMenu";

const STATUS_CONFIG = {
  valid: {
    label: "Valid",
<<<<<<< HEAD
    bg: "var(--bg-success-soft)",
=======
    bg: "#DCFCE7",
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
    color: "#15803D",
  },
  "expiring-soon": {
    label: "Expiring Soon",
<<<<<<< HEAD
    bg: "var(--bg-warning-soft)",
=======
    bg: "#FEF3C7",
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
    color: "#92400E",
  },
  expired: {
    label: "Expired",
    bg: "#FECACA",
<<<<<<< HEAD
    color: "var(--color-error)",
=======
    color: "#DC2626",
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
  },
};

function EmirateIdRow({ row }) {
  const navigate = useNavigate();
  const cfg = STATUS_CONFIG[row.emirateIdStatus] || STATUS_CONFIG.expired;
  const actions = [
    {
      id: "view",
      label: "View Profile",
      icon: <VisibilityOutlinedIcon fontSize="small" />,
      onClick: () => navigate(`/employees/${row.id}`),
    },
  ];

  return (
    <TableRow sx={{ height: 44 }}>
      <TableCell sx={CELL_SX}>{row.id}</TableCell>
      <TableCell sx={CELL_SX}>{row.name}</TableCell>
      <TableCell sx={CELL_SX}>{row.emirateIdNo}</TableCell>
      <TableCell sx={CELL_SX}>{row.emirateIdExpiry}</TableCell>

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

      <TableCell align="center" sx={ACTION_CELL_SX}>
        <EmployeeActionMenu actions={actions} employeeId={row.id} />
      </TableCell>
    </TableRow>
  );
}

<<<<<<< HEAD
export default EmirateIdRow;
=======
export default EmirateIdRow;
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
