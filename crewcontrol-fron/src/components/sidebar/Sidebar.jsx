import { Box, Typography, Button } from "@mui/material";
import { useNavigate, useLocation } from "react-router-dom";

import routesConfig from "../../routes/routesConfig";
import crewioLogo from "../../assets/crewio_logo.svg";

/* ---------- NAV ITEM ---------- */
function NavItem({ Icon, label, selected, onClick, comingSoon = false }) {
  const iconColor = selected ? "var(--color-primary)" : "var(--text-secondary)";
  const textColor = selected ? "var(--text-primary)" : "var(--text-secondary)";

  return (
    <Box
      onClick={onClick}
      sx={{
        height: 32,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        px: "12px",
        borderRadius: "8px",
        cursor: "pointer",
        backgroundColor: selected ? "var(--bg-info-soft)" : "var(--bg-surface)",
        "&:hover": {
          backgroundColor: selected ? "var(--bg-info-soft)" : "#EDF1FC",
        },
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
        {/* ✅ SAFE ICON RENDER */}
        {Icon ? (
          <Icon sx={{ fontSize: 18, color: iconColor }} />
        ) : null}

        <Typography
          fontSize={14}
          fontWeight={selected ? 500 : 400}
          sx={{ color: textColor }}
        >
          {label}
        </Typography>
      </Box>

      {comingSoon ? (
        <Box
          sx={{
            px: "10px",
            height: 18,
            borderRadius: "999px",
            backgroundColor: "var(--bg-info-soft)",
            display: "flex",
            alignItems: "center",
          }}
        >
          <Typography sx={{ fontSize: 10, fontWeight: 500, color: "#3B82F6" }}>
            Coming Soon
          </Typography>
        </Box>
      ) : null}
    </Box>
  );
}

/* ---------- SIDEBAR ---------- */
function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  // ✅ SAFETY CHECK
  if (!Array.isArray(routesConfig)) {
    console.error("routesConfig is not an array");
    return null;
  }

  return (
    <Box
      sx={{
        width: 244,
        height: "100vh",
        backgroundColor: "var(--bg-surface)",
        borderRight: "1px solid var(--border-card)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      {/* TOP SECTION */}
      <Box>
        {/* LOGO */}
        <Box
          sx={{
            height: 72,
            borderBottom: "1px solid var(--border-card)",
            display: "flex",
            alignItems: "center",
            px: "22px",
          }}
        >
          <Box
            component="img"
            src={crewioLogo}
            alt="Crewio logo"
            sx={{ height: 30, width: "auto", display: "block" }}
          />
        </Box>

        {/* NAVIGATION */}
        <Box sx={{ px: "14px", mt: "18px" }}>
          <Box sx={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {routesConfig.map((route) => (
              <NavItem
                key={route.path}
                Icon={route.icon}
                label={route.label}
                selected={location.pathname === route.path}
                comingSoon={Boolean(route.comingSoon)}
                onClick={() => {
                  if (!route.comingSoon) {
                    navigate(route.path);
                  }
                }}
              />
            ))}
          </Box>
        </Box>
      </Box>

      {/* CTA SECTION */}
      <Box
        sx={{
          px: "12px",
          pb: "18px",
          pt: "14px",
        }}
      >
        <Box
          sx={{
            border: "1px solid var(--border-input)",
            borderRadius: "12px",
            backgroundColor: "var(--bg-surface)",
            boxShadow: "0px 0px 2px var(--shadow-soft)",
            px: "18px",
            py: "14px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          <Box sx={{ textAlign: "center" }}>
            <Typography sx={{ fontSize: 12, color: "var(--text-disabled)", mb: "2px" }}>
              Current Plan
            </Typography>
            <Typography sx={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)" }}>
              Crewio Plus
            </Typography>
          </Box>

          <Button
            fullWidth
            variant="contained"
            onClick={() => navigate("/subscription")}
            sx={{
              height: 32,
              borderRadius: "8px",
              textTransform: "none",
              fontSize: 14,
              fontWeight: 500,
              boxShadow: "none",
            }}
          >
            Upgrade Plan
          </Button>
        </Box>
      </Box>
    </Box>
  );
}

export default Sidebar;

