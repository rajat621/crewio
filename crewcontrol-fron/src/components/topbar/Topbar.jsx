import { useState } from "react";
import { useLocation } from "react-router-dom";
import {
  Box,
  Typography,
  IconButton,
  TextField,
  InputAdornment,
} from "@mui/material";
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import NotificationsNoneOutlinedIcon from "@mui/icons-material/NotificationsNoneOutlined";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import SettingsIcon from "@mui/icons-material/Settings";
import SearchIcon from "@mui/icons-material/Search";

import NotificationPopover from "../notification/NotificationPopover";
import ProfilePopover from "../profile/ProfilePopover";
import routesConfig from "../../routes/routesConfig";
import crewioLogo from "../../assets/crewio_logo.png";

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

  const currentRoute =
    routesConfig.find((route) => route.path === location.pathname) ||
    routesConfig.find(
      (route) => route.path !== "/" && location.pathname.startsWith(`${route.path}/`)
    );

  const TitleIcon = currentRoute?.icon;
  const title = currentRoute?.title || "";
  const showSearch = Boolean(currentRoute?.topbar?.showSearch);
  const showAddNew = Boolean(currentRoute?.topbar?.showAddNew);

  return (
    <>
      <Box
        sx={{
          height: 72,
          borderBottom: "1px solid var(--border-card)",
          px: "40px",
          py: "20px",
          backgroundColor: "var(--bg-surface)",
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
              <Box
                component="img"
                src={crewioLogo}
                alt="Crewio logo"
                sx={{ height: 30, width: "auto", display: "block" }}
              />
            ) : isProfilePopupPage ? (
              <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <SettingsIcon sx={{ fontSize: 20, color: "var(--text-primary)" }} />
                <Typography fontSize={14} fontWeight={500} color="var(--text-primary)">
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
            {showAddNew ? (
              <Box
                onClick={onAddNew}
                sx={{
                  height: 32,
                  px: "14px",
                  display: "flex",
                  alignItems: "center",
                  borderRadius: "8px",
                  cursor: "pointer",
<<<<<<< HEAD
                  backgroundColor: "var(--color-primary)",
                  color: "var(--bg-surface)",
                  fontSize: 14,
                  fontWeight: 400,
                  boxShadow: "0px 2px 8px var(--shadow-floating)",
                }}
              >
                Quick Actions
=======
                  backgroundColor: "#2C5FEA",
                  color: "#FFFFFF",
                  fontSize: 14,
                  fontWeight: 500,
                  boxShadow: "0px 2px 8px rgba(44, 95, 234, 0.25)",
                }}
              >
                Add New
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
              </Box>
            ) : null}

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
                  ? "var(--bg-info-soft)"
                  : "var(--bg-surface)",
                "&:hover": {
                  backgroundColor: isProfileOpen
                    ? "var(--bg-info-soft)"
                    : "#EDF1FC",
                },
              }}
            >
              <AccountCircleIcon
                sx={{
                  width: 32,
                  height: 32,
                  color: "var(--text-secondary)",
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


