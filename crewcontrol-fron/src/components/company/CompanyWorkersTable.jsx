import { useState } from "react";
import {
  TableCell,
  TableRow,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
} from "@mui/material";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import { useNavigate } from "react-router-dom";
import UniversalTable from "../table/UniversalTable";
import { ROW_SX } from "../table/tableUtils";

const COLUMNS = [
  { key: "slNo", label: "Sl no." },
  { key: "employeeName", label: "Employee Name" },
  { key: "trade", label: "Trade" },
  { key: "rate", label: "Rate" },
  { key: "status", label: "Status", align: "center" },
  { key: "action", label: "Action", align: "center" },
];

function CompanyWorkersTable({ workers }) {
  const navigate = useNavigate();
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [selectedRow, setSelectedRow] = useState(null);

  const cellSx = {
    fontSize: "10px",
    color: "#757575",
    lineHeight: "20px",
    letterSpacing: "0.2px",
    borderBottom: "1px solid #DEDEDE",
    py: "0px",
    height: "44px",
  };

  const handleOpenMenu = (event, row) => {
    event.stopPropagation();
    setMenuAnchor(event.currentTarget);
    setSelectedRow(row);
  };

  const handleCloseMenu = () => {
    setMenuAnchor(null);
    setSelectedRow(null);
  };

  const handleMenuAction = (action) => {
    if (action === "view" && selectedRow?.id) {
      navigate(`/employees/${selectedRow.id}`);
    }

    handleCloseMenu();
  };

  return (
    <>
      <UniversalTable
        columns={COLUMNS}
        rows={workers}
        rowsPerPage={10}
        searchKeys={["name", "trade"]}
        searchPlaceholder="Search for application id, name..."
        containerSx={{
          borderColor: "#DEDEDE",
          borderRadius: "8px",
          boxShadow: "none",
        }}
        toolbarRootSx={{
          px: 1.5,
          py: 1,
          minHeight: "52px",
        }}
        toolbarSearchSx={{
          width: "340px",
          "& .MuiInputBase-root": {
            fontSize: "14px",
            color: "#9CA3AF",
          },
        }}
        toolbarPaginationTextSx={{
          fontSize: "12px",
          color: "#6B7280",
        }}
        toolbarNavButtonSx={{
          width: 30,
          height: 30,
          borderColor: "#DEDEDE",
        }}
        headerRowSx={{ height: 32 }}
        headerCellSx={{
          fontSize: "10px",
          fontWeight: 600,
          color: "#757575",
          bgcolor: "#FFFFFF",
          borderBottom: "1px solid #E9E9EE",
          py: 0,
          lineHeight: "20px",
          letterSpacing: "0.2px",
        }}
        renderRow={(row, index, rowOffset) => (
          <TableRow key={row.id} sx={{ ...ROW_SX, height: 44 }}>
            <TableCell sx={cellSx}>{String(rowOffset + index + 1).padStart(2, "0")}</TableCell>
            <TableCell sx={cellSx}>{row.name}</TableCell>
            <TableCell sx={cellSx}>{row.trade}</TableCell>
            <TableCell sx={cellSx}>{row.rate}</TableCell>

            <TableCell align="center" sx={cellSx}>
              <Chip
                label="Valid"
                size="small"
                sx={{
                  height: 20,
                  minWidth: 100,
                  px: 1,
                  borderRadius: "999px",
                  bgcolor: "#DDEDE3",
                  fontSize: 11,
                  fontWeight: 500,
                }}
              />
            </TableCell>

            <TableCell align="center" sx={cellSx}>
              <IconButton size="small" onClick={(event) => handleOpenMenu(event, row)} sx={{ p: "4px" }}>
                <MoreVertIcon sx={{ fontSize: 16, color: "#757575" }} />
              </IconButton>
            </TableCell>
          </TableRow>
        )}
      />

      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleCloseMenu}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        PaperProps={{
          sx: {
            minWidth: 132,
            borderRadius: "12px",
            boxShadow: "0 8px 24px rgba(17, 24, 39, 0.14)",
            mt: "6px",
          },
        }}
      >
        <MenuItem onClick={() => handleMenuAction("view")}>
          <ListItemIcon>
            <VisibilityOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>View Profile</ListItemText>
        </MenuItem>
      </Menu>
    </>
  );
}

export default CompanyWorkersTable;
