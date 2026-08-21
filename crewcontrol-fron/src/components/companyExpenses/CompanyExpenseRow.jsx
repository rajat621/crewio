import { TableRow, TableCell, IconButton, Menu, MenuItem, Typography } from "@mui/material";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import { useState } from "react";
import { ACTION_CELL_SX, ACTION_ICON_BUTTON_SX } from "../table/tableUtils";

export default function CompanyExpenseRow({ row, slNo, onEdit, onDelete }) {
  const [anchorEl, setAnchorEl] = useState(null);
  const open = Boolean(anchorEl);

  const handleOpen = (e) => setAnchorEl(e.currentTarget);
  const handleClose = () => setAnchorEl(null);

  return (
    <TableRow hover>
      <TableCell>{String(slNo).padStart(2, "0")}</TableCell>
      <TableCell>{row.name}</TableCell>
      <TableCell>{row.dateLabel}</TableCell>
      <TableCell>{row.amount.toFixed(2)}</TableCell>

      <TableCell align="center" sx={ACTION_CELL_SX}>
        <IconButton size="small" onClick={handleOpen} sx={ACTION_ICON_BUTTON_SX}>
          <MoreVertIcon fontSize="small" />
        </IconButton>
        <Menu anchorEl={anchorEl} open={open} onClose={handleClose}>
          <MenuItem
            onClick={() => {
              handleClose();
              onEdit?.(row);
            }}
          >
            <EditIcon sx={{ mr: 1 }} fontSize="small" />
            <Typography fontSize={14}>Edit</Typography>
          </MenuItem>
          <MenuItem
            onClick={() => {
              handleClose();
              onDelete?.(row);
            }}
          >
            <DeleteIcon sx={{ mr: 1 }} fontSize="small" />
            <Typography fontSize={14}>Delete</Typography>
          </MenuItem>
        </Menu>
      </TableCell>
    </TableRow>
  );
}