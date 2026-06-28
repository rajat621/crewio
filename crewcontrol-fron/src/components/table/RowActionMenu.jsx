import { IconButton, Menu, MenuItem, ListItemIcon, Typography } from "@mui/material";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined";
import BlockOutlinedIcon from "@mui/icons-material/BlockOutlined";
import { useState } from "react";
import { ACTION_ICON_BUTTON_SX } from "./tableUtils";

function RowActionMenu({ onView, onEdit, onAssign, onDeactivate }) {
  const [anchorEl, setAnchorEl] = useState(null);
  const open = Boolean(anchorEl);

  const handleOpen = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  return (
    <>
      <IconButton size="small" onClick={handleOpen} sx={ACTION_ICON_BUTTON_SX}>
        <MoreVertIcon fontSize="small" />
      </IconButton>

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "right",
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "right",
        }}
        PaperProps={{
          sx: {
            borderRadius: "12px",
            minWidth: 180,
            boxShadow: "0px 8px 24px rgba(0,0,0,0.12)",
            p: "4px 0",
          },
        }}
      >
        <MenuItem
          onClick={() => {
            handleClose();
            onView?.();
          }}
        >
          <ListItemIcon>
            <VisibilityOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <Typography fontSize={14}>View Profile</Typography>
        </MenuItem>

        <MenuItem
          onClick={() => {
            handleClose();
            onEdit?.();
          }}
        >
          <ListItemIcon>
            <EditOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <Typography fontSize={14}>Edit</Typography>
        </MenuItem>

        <MenuItem
          onClick={() => {
            handleClose();
            onAssign?.();
          }}
        >
          <ListItemIcon>
            <AssignmentOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <Typography fontSize={14}>Assign</Typography>
        </MenuItem>

        <MenuItem
          onClick={() => {
            handleClose();
            onDeactivate?.();
          }}
        >
          <ListItemIcon>
            <BlockOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <Typography fontSize={14}>Unactive</Typography>
        </MenuItem>
      </Menu>
    </>
  );
}

export default RowActionMenu;
