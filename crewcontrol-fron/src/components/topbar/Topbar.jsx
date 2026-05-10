import { useState } from "react";
import { useLocation } from "react-router-dom";
import {
  Box,
  Typography,
  IconButton,
} from "@mui/material";
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import NotificationsNoneOutlinedIcon from "@mui/icons-material/NotificationsNoneOutlined";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import SettingsIcon from "@mui/icons-material/Settings";

import NotificationPopover from "../notification/NotificationPopover";
import ProfilePopover from "../profile/ProfilePopover";
import routesConfig from "../../routes/routesConfig";

function Topbar({ onAddNew }) {
  const location = useLocation();
  const isChatPage = location.pathname === "/chat";
  const isProfilePopupPage = [
    "/user-profile",
    "/company-profile",
    "/account-security",
    "/subscription",
    "/help-support",
    "/help-support/faqs",
  ].includes(location.pathname);

  const [notificationAnchor, setNotificationAnchor] = useState(null);
  const [profileAnchor, setProfileAnchor] = useState(null);

  const isProfileOpen = Boolean(profileAnchor);

  const currentRoute = routesConfig.find(
    (route) => route.path === location.pathname
  );

  const TitleIcon = currentRoute?.icon;
  const title = currentRoute?.title || "";

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
          {/* LEFT: TITLE / LOGO / CONTEXT */}
          <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {isChatPage ? (
              <Typography fontSize={16} fontWeight={600} color="#1D1D1E">
                CrewControl
              </Typography>
            ) : isProfilePopupPage ? (
              <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <SettingsIcon sx={{ fontSize: 20, color: "#141414" }} />
                <Typography fontSize={14} fontWeight={500} color="#141414">
                  Setting
                </Typography>
              </Box>
            ) : (
              <>
                {TitleIcon ? <TitleIcon sx={{ fontSize: 20 }} /> : null}
                <Typography fontSize={14} fontWeight={500}>
                  {title}
                </Typography>
              </>
            )}
          </Box>

          {/* RIGHT: ACTIONS */}
          <Box sx={{ display: "flex", alignItems: "center", gap: "16px" }}>
            {/* 🔔 NOTIFICATION */}
            <IconButton
              onClick={(e) => setNotificationAnchor(e.currentTarget)}
              sx={{
                width: 32,
                height: 32,
                "&:hover": { backgroundColor: "#EDF1FC" },
              }}
            >
              <NotificationsNoneOutlinedIcon sx={{ fontSize: 20 }} />
            </IconButton>

            {/* 👤 PROFILE */}
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
              <AccountCircleIcon
                sx={{
                  width: 32,
                  height: 32,
                  color: "#808080",
                }}
              />

              {isProfileOpen ? (
                <KeyboardArrowUpIcon sx={{ fontSize: 20 }} />
              ) : (
                <KeyboardArrowDownIcon sx={{ fontSize: 20 }} />
              )}
            </Box>
          </Box>
        </Box>
      </Box>

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

export default Topbar;

