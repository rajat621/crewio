import { useState } from "react";
import {
  Box,
  IconButton,
  Avatar,
  Typography,
} from "@mui/material";

import NotificationsNoneOutlinedIcon from "@mui/icons-material/NotificationsNoneOutlined";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";

import NotificationPopover from "../notification/NotificationPopover";
import ProfilePopover from "../profile/ProfilePopover";

// OPTIONAL logo import
// If this path is wrong, text will still render
// import Logo from "../assets/logo.svg";

function FlowTopbar() {
  const [notificationAnchor, setNotificationAnchor] = useState(null);
  const [profileAnchor, setProfileAnchor] = useState(null);

  const isProfileOpen = Boolean(profileAnchor);

  return (
    <>
      <Box
        sx={{
          height: 72,
          borderBottom: "1px solid #DEDEDE",
          px: "40px",
          py: "20px",
          backgroundColor: "#FFFFFF",
          display: "flex",
          alignItems: "center",
        }}
      >
        <Box
          sx={{
            height: 32,
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {/* LEFT: BRAND (LOGO + NAME) */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            {/* Logo (optional, safe) */}
            {/* {Logo && (
              <Box
                component="img"
                src={Logo}
                alt="CrewControl"
                sx={{
                  height: 24,
                  width: "auto",
                }}
                onError={(e) => {
                  // hide broken image, keep text
                  e.currentTarget.style.display = "none";
                }}
              />
            )} */}

            {/* Brand text (ALWAYS visible) */}
            <Typography
              fontSize={20}
              fontWeight={600}
              sx={{ lineHeight: 1 }}
            >
              CrewControl
            </Typography>
          </Box>

          {/* RIGHT: ACTIONS */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: "16px",
            }}
          >
            {/* 🔔 Notification */}
            <IconButton
              onClick={(e) =>
                setNotificationAnchor(e.currentTarget)
              }
              sx={{
                width: 32,
                height: 32,
                "&:hover": { backgroundColor: "#EDF1FC" },
              }}
            >
              <NotificationsNoneOutlinedIcon
                sx={{ fontSize: 20 }}
              />
            </IconButton>

            {/* 👤 Profile */}
            <Box
              onClick={(e) => setProfileAnchor(e.currentTarget)}
              sx={{
                height: 32,
                pr: "4px",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                borderRadius: "16px",
                cursor: "pointer",
                backgroundColor: isProfileOpen
                  ? "#DBE2F9"
                  : "#FFFFFF",
                "&:hover": {
                  backgroundColor: isProfileOpen
                    ? "#DBE2F9"
                    : "#EDF1FC",
                },
              }}
            >
              <Avatar sx={{ width: 32, height: 32 }} />
              {isProfileOpen ? (
                <KeyboardArrowUpIcon sx={{ fontSize: 20 }} />
              ) : (
                <KeyboardArrowDownIcon sx={{ fontSize: 20 }} />
              )}
            </Box>
          </Box>
        </Box>
      </Box>

      {/* POPOVERS */}
      <NotificationPopover
        anchorEl={notificationAnchor}
        open={Boolean(notificationAnchor)}
        onClose={() => setNotificationAnchor(null)}
      />

      <ProfilePopover
        anchorEl={profileAnchor}
        open={isProfileOpen}
        onClose={() => setProfileAnchor(null)}
      />
    </>
  );
}

export default FlowTopbar;
