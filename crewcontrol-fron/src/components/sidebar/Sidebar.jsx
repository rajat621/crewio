import { Box, Typography, Button } from "@mui/material";
import { useNavigate, useLocation } from "react-router-dom";

import routesConfig from "../../routes/routesConfig";

/* ---------- NAV ITEM ---------- */
function NavItem({ Icon, label, selected, onClick }) {
  const iconColor = selected ? "#1D4ED8" : "#757575";
  const textColor = selected ? "#141414" : "#757575";

  return (
    <Box
      onClick={onClick}
      sx={{
        height: 32,
        display: "flex",
        alignItems: "center",
        px: "12px",
        borderRadius: "8px",
        cursor: "pointer",
        backgroundColor: selected ? "#DBE2F9" : "#FFFFFF",
        "&:hover": {
          backgroundColor: selected ? "#DBE2F9" : "#EDF1FC",
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
    </Box>
  );
}

/* ---------- SIDEBAR ---------- */
function Sidebar({ onAddNew }) {
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
        backgroundColor: "#FFFFFF",
        borderRight: "1px solid #DEDEDE",
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
            borderBottom: "1px solid #DEDEDE",
            display: "flex",
            alignItems: "center",
            px: "26px",
          }}
        >
          <Typography fontSize={24} fontWeight={600}>
            CrewControl
          </Typography>
        </Box>

        {/* NAVIGATION */}
        <Box sx={{ px: "14px", mt: "24px" }}>
          <Box sx={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {routesConfig.map((route) => (
              <NavItem
                key={route.path}
                Icon={route.icon}
                label={route.label}
                selected={location.pathname === route.path}
                onClick={() => navigate(route.path)}
              />
            ))}
          </Box>
        </Box>
      </Box>

      {/* CTA SECTION */}
      <Box
        sx={{
          height: 72,
          px: "14px",
          py: "20px",
          borderTop: "1px solid #DEDEDE",
        }}
      >
        <Button
          fullWidth
          variant="contained"
          onClick={onAddNew}
          sx={{
            height: 32,
            borderRadius: "8px",
            textTransform: "none",
            fontSize: 14,
            fontWeight: 500,
            boxShadow: "none",
          }}
        >
          Add New
        </Button>
      </Box>
    </Box>
  );
}

export default Sidebar;
