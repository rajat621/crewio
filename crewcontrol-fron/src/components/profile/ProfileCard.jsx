import {
  Box,
  Typography,
  Divider,
  Switch,
  Button,
} from "@mui/material";
import { useEffect, useState } from "react";
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { companiesApi } from "../../api/companies";
import { isCompanyProfileComplete } from "../../utils/companyProfileStatus";
import { getCompanyId } from "../../utils/companyHelpers";
import BusinessIcon from '@mui/icons-material/Business';
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import CreditCardOutlinedIcon from "@mui/icons-material/CreditCardOutlined";
import NotificationsOutlinedIcon from "@mui/icons-material/NotificationsOutlined";
import LanguageOutlinedIcon from "@mui/icons-material/LanguageOutlined";
import SecurityOutlinedIcon from "@mui/icons-material/SecurityOutlined";
import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import FavoriteBorderOutlinedIcon from "@mui/icons-material/FavoriteBorderOutlined";
import HelpOutlineOutlinedIcon from "@mui/icons-material/HelpOutlineOutlined";
import LogoutOutlinedIcon from "@mui/icons-material/LogoutOutlined";

const ICON_COLOR = "#757575";

const Row = ({ icon, label, right, onClick, warningIcon, disabled = false }) => (
  <Box
    onClick={disabled ? undefined : onClick}
    sx={{
      height: 40,
      px: "12px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      borderRadius: "8px",
      cursor: disabled ? "not-allowed" : onClick ? "pointer" : "default",
      opacity: disabled ? 0.55 : 1,
      "&:hover": {
        backgroundColor: !disabled && onClick ? "#F5F7FD" : "transparent",
      },
    }}
  >
    <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
      {icon}
      <Typography fontSize={14} color="#141414">
        {label}
      </Typography>
      {warningIcon && (
        <Box sx={{ display: "flex", alignItems: "center", ml: "4px" }}>
          {warningIcon}
        </Box>
      )}
    </Box>
    {right}
  </Box>
);

function ProfileCard({ onClose }) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [companyStatus, setCompanyStatus] = useState("unknown");

  const handleViewProfile = () => {
    onClose?.();
    navigate("/user-profile");
  };

  const handleCompanyProfile = () => {
    onClose?.();
    navigate("/company-profile");
  };

  const handleSubscription = () => {
    onClose?.();
    navigate("/subscription");
  };

  const handleAccountSecurity = () => {
    onClose?.();
    navigate("/account-security");
  };

  const handleHelpSupport = () => {
    onClose?.();
    navigate("/help-support");
  };

  const handleLogout = () => {
    onClose?.();
    logout();
    navigate("/signin", { replace: true });
  };

  useEffect(() => {
    let active = true;

    const loadCompanyStatus = async () => {
      if (active) setCompanyStatus("unknown");

      const companyId = getCompanyId(user);
      if (!companyId) {
        if (active) setCompanyStatus("incomplete");
        return;
      }

      try {
        const response = await companiesApi.getCompany(companyId);
        const company = response?.data?.data || response?.data;
        if (active) {
          setCompanyStatus(isCompanyProfileComplete(company) ? "complete" : "incomplete");
        }
      } catch (error) {
        if (active) setCompanyStatus("incomplete");
      }
    };

    loadCompanyStatus();

    return () => {
      active = false;
    };
  }, [user?.companyId, user?.company]);

  const showWarning = companyStatus === "incomplete";

  return (
    <Box
      sx={{
        width: 320,
        backgroundColor: "#FFFFFF",
        border: "1px solid #DEDEDE",
        borderRadius: "12px",
        boxShadow:
          "0px 0px 2px 0px rgba(80, 92, 95, 0.2), 0px 6px 10px 0px rgba(0, 0, 0, 0.04)",
        p: "16px 12px",
      }}
    >
      {/* USER INFO */}
      <Box
        onClick={handleViewProfile}
        sx={{
          border: "1px solid #DEDEDE",
          borderRadius: "12px",
          p: "12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: "16px",
          cursor: "pointer",
          "&:hover": {
            backgroundColor: "#F5F7FD",
          },
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <AccountCircleIcon
            sx={{
              width: 44,
              height: 44,
              color: "#808080",
            }}
          />          <Box>
            <Typography fontSize={14} fontWeight={600} color="#141414">
              {user?.firstName || "Jonathan"}
            </Typography>
            <Typography fontSize={12} color="#757575">
              {user?.email || "jonathan@gmail.com"}
            </Typography>
          </Box>
        </Box>
        <ChevronRightIcon sx={{ fontSize: 20, color: ICON_COLOR }} />
      </Box>

      {/* PAYMENTS */}
      <Row
        icon={<CreditCardOutlinedIcon sx={{ fontSize: 20, color: ICON_COLOR }} />}
        label="Your Subscription"
        right={<ChevronRightIcon sx={{ fontSize: 20, color: ICON_COLOR }} />}
        onClick={handleSubscription}
      />

      <Divider sx={{ my: "12px", borderColor: "#DEDEDE" }} />

      {/* SETTINGS LABEL */}
      <Typography fontSize={12} color="#757575" sx={{ mb: "8px" }}>
        Setting & Preferences
      </Typography>

      <Row
        icon={<BusinessIcon sx={{ fontSize: 20, color: ICON_COLOR }} />}
        label="Company Profile"
        right={<ChevronRightIcon sx={{ fontSize: 20, color: ICON_COLOR }} />}
        onClick={handleCompanyProfile}
        warningIcon={
          showWarning ? (
            <WarningAmberRoundedIcon sx={{ fontSize: 16, color: "#DC2626" }} />
          ) : undefined
        }
      />

      <Row
        icon={<LanguageOutlinedIcon sx={{ fontSize: 20, color: ICON_COLOR }} />}
        label="Language"
        right={
          <Typography fontSize={14} color="#1D4ED8">
            English
          </Typography>
        }
        onClick={() => {}}
      />

      <Row
        icon={<SecurityOutlinedIcon sx={{ fontSize: 20, color: ICON_COLOR }} />}
        label="Account & Security"
        right={<ChevronRightIcon sx={{ fontSize: 20, color: ICON_COLOR }} />}
        onClick={handleAccountSecurity}
      />

      {/* DARK MODE (SPECIAL CASE) */}
      <Row
        icon={<DarkModeOutlinedIcon sx={{ fontSize: 20, color: ICON_COLOR }} />}
        label="Dark mode"
        right={
          <Switch
            size="small"
            aria-label="toggle dark mode"
            onClick={(e) => e.stopPropagation()}
          />
        }
      />

      <Divider sx={{ my: "12px", borderColor: "#DEDEDE" }} />

      {/* SUPPORT LABEL */}
      <Typography fontSize={12} color="#757575" sx={{ mb: "8px" }}>
        Support
      </Typography>

      <Row
        icon={<FavoriteBorderOutlinedIcon sx={{ fontSize: 20, color: ICON_COLOR }} />}
        label="Invite friends"
        right={<ChevronRightIcon sx={{ fontSize: 20, color: ICON_COLOR }} />}
        disabled
      />

      <Row
        icon={<HelpOutlineOutlinedIcon sx={{ fontSize: 20, color: ICON_COLOR }} />}
        label="Help & Support"
        right={<ChevronRightIcon sx={{ fontSize: 20, color: ICON_COLOR }} />}
        onClick={handleHelpSupport}
      />

      {/* LOGOUT */}
      <Button
        fullWidth
        variant="outlined"
        startIcon={<LogoutOutlinedIcon />}
        onClick={handleLogout}
        sx={{
          mt: "16px",
          height: 40,
          borderRadius: "8px",
          textTransform: "none",
          color: "#1D4ED8",
          borderColor: "#CBD5FF",
          "&:hover": {
            borderColor: "#1D4ED8",
            backgroundColor: "#F5F7FD",
          },
        }}
      >
        Logout
      </Button>
    </Box>
  );
}

export default ProfileCard;
