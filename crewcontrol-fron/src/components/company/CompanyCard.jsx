import { Box, Typography, Divider, IconButton, Menu, MenuItem, ListItemIcon, ListItemText } from "@mui/material";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

function StatusChip({ status }) {
  const active = status === "active";

  return (
    <Box
      sx={{
        height: 24,
        px: "12px",
        borderRadius: "16px",
        bgcolor: active ? "#DCFCE7" : "#FECACA",
        color: active ? "#166534" : "#991B1B",
        fontSize: 12,
        fontWeight: 500,
        display: "flex",
        alignItems: "center",
      }}
    >
      {active ? "Active" : "Deactivate"}
    </Box>
  );
}

function CompanyCard({ company }) {
  const navigate = useNavigate();
  const [menuAnchor, setMenuAnchor] = useState(null);

  const handleMenuOpen = (event) => {
    event.stopPropagation();
    setMenuAnchor(event.currentTarget);
  };

  const handleMenuClose = (event) => {
    event?.stopPropagation?.();
    setMenuAnchor(null);
  };

  const handleMenuAction = (action) => {
    if (action === "view") navigate(`/company/${company.id}`);
    if (action === "edit") navigate(`/company/${company.id}?mode=edit`);
    if (action === "assign") navigate(`/employees?companyId=${company.id}`);
    if (action === "invoice") navigate(`/tax-invoices/generate?companyId=${company.id}`);
    if (action === "deactivate" && typeof company.onDeactivate === "function") {
      company.onDeactivate(company.id);
    }
    setMenuAnchor(null);
  };

  const handleCardClick = () => {
    navigate(`/company/${company.id}`);
  };

  return (
    <Box
      onClick={handleCardClick}
      sx={{
        border: "1px solid #DEDEDE",
        borderRadius: "8px",
        overflow: "hidden",
        bgcolor: "#FFFFFF",
        cursor: "pointer",
        transition: "box-shadow 0.2s ease",
        "&:hover": {
          boxShadow: "0 3px 10px rgba(0,0,0,0.08)",
        },
      }}
    >
      {/* ===== HEADER ===== */}
      <Box sx={{ bgcolor: "#F7F6FF", px: 2.5, py: 2 }}>
        {/* Row 1 */}
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <Box>
            <Typography fontSize={18} fontWeight={600} color="#111827">
              {company.name}
            </Typography>
            <Typography fontSize={12} color="#757575">
              {company.dateRange}
            </Typography>
          </Box>

          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }} onClick={(e) => e.stopPropagation()}>
            <StatusChip status={company.status} />
            <IconButton size="small" onClick={handleMenuOpen}>
              <MoreVertIcon sx={{ fontSize: 18, color: "#6B7280" }} />
            </IconButton>
          </Box>
        </Box>

        {/* Row 2 */}
        <Box
          sx={{
            mt: 2.5,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Box
            sx={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              bgcolor: "#1D4ED8",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#FFFFFF",
            }}
          >
            <GroupsOutlinedIcon fontSize="medium" />
          </Box>

          <Box sx={{ textAlign: "right" }}>
            <Typography fontSize={12} color="#757575">
              Total worker assigned
            </Typography>
            <Typography fontSize={18} fontWeight={450} color="#141414">
              {company.totalWorkers}
            </Typography>
          </Box>
        </Box>
      </Box>

      <Divider />

      {/* ===== FOOTER ===== */}
      <Box sx={{ px: 2.5, py: 1.5 }}>
        {[
          { label: "Present workers", value: company.present, color: "#22C55E" },
          { label: "Absent workers", value: company.absent, color: "#F97316" },
          { label: "On leave workers", value: company.onLeave, color: "#22C55E" },
        ].map((item) => (
          <Box
            key={item.label}
            sx={{
              display: "flex",
              justifyContent: "space-between",
              mb: 0.75,
            }}
          >
            <Typography fontSize={12} color="#757575">
              {item.label}
            </Typography>
            <Typography fontSize={12} fontWeight={500} color={item.color}>
              {item.value.toString().padStart(2, "0")}
            </Typography>
          </Box>
        ))}
      </Box>

      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleMenuClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        PaperProps={{
          sx: {
            mt: 0.5,
            borderRadius: 2,
            minWidth: 210,
            boxShadow: "0 8px 24px rgba(17, 24, 39, 0.16)",
          },
        }}
      >
        <MenuItem onClick={() => handleMenuAction("view")}>
          <ListItemIcon>
            <VisibilityOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>View Company</ListItemText>
        </MenuItem>

        <MenuItem onClick={() => handleMenuAction("edit")}>
          <ListItemIcon>
            <DescriptionOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Edit Company</ListItemText>
        </MenuItem>

        <MenuItem onClick={() => handleMenuAction("assign")}>
          <ListItemIcon>
            <DescriptionOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Assign Employees</ListItemText>
        </MenuItem>

        <MenuItem onClick={() => handleMenuAction("invoice")}>
          <ListItemIcon>
            <DescriptionOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Generate Invoice</ListItemText>
        </MenuItem>

        <MenuItem onClick={() => handleMenuAction("deactivate")}>
          <ListItemIcon>
            <DescriptionOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Deactivate Company</ListItemText>
        </MenuItem>
      </Menu>
    </Box>
  );
}

export default CompanyCard;

