import {
  Popover,
  Box,
  Typography,
  Avatar,
  Divider,
  Stack,
} from "@mui/material";

import ProfileCard from "./ProfileCard";

function ProfilePopover({ anchorEl, open, onClose }) {
  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      transformOrigin={{ vertical: "top", horizontal: "right" }}
      PaperProps={{
        sx: {
          backgroundColor: "transparent",
          boxShadow: "none",
          overflow: "visible",
        },
      }}

    >
      <ProfileCard onClose={onClose} />
    </Popover>
  );
}

export default ProfilePopover;
