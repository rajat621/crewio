import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  IconButton,
  Menu,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
  InputAdornment,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import SearchIcon from "@mui/icons-material/Search";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import { ACTION_CELL_SX, ACTION_ICON_BUTTON_SX } from "../table/tableUtils";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import { useNavigate } from "react-router-dom";
import { employeesApi } from "../../api/employees";

const ROWS_PER_PAGE = 5;

function AssignEmployeeDialog({ open, onClose, companyId, onAssigned }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState([]);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [menuRow, setMenuRow] = useState(null);

  const loadUnassignedEmployees = async () => {
    try {
      setLoading(true);
      const response = await employeesApi.getEmployees({ status: "active", page: 1, limit: 500 });
      const rawEmployees = Array.isArray(response?.data?.employees)
        ? response.data.employees
        : Array.isArray(response?.data?.data)
          ? response.data.data
          : [];

      const rows = rawEmployees
        .filter((employee) => {
          if (Object.prototype.hasOwnProperty.call(employee || {}, "company")) {
            return !employee?.company;
          }

          return !employee?.assignedCompanyId && !employee?.companyId;
        })
        .map((employee) => ({
          id: employee?._id,
          employeeId: employee?.employeeId || employee?._id || "-",
          name:
            `${employee?.firstName || ""} ${employee?.lastName || ""}`.trim() ||
            employee?.name ||
            "-",
          trade: employee?.trade || employee?.position || "-",
          rate: Number(employee?.ratePerHour || employee?.salary || 0).toFixed(2),
        }));

      setEmployees(rows);
      setSelectedIds([]);
      setPage(1);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadUnassignedEmployees();
    }
  }, [open]);

  const filteredEmployees = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return employees;

    return employees.filter((employee) => {
      return (
        employee.employeeId.toLowerCase().includes(keyword) ||
        employee.name.toLowerCase().includes(keyword)
      );
    });
  }, [employees, query]);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(filteredEmployees.length / ROWS_PER_PAGE));
    if (page > maxPage) {
      setPage(maxPage);
    }
  }, [filteredEmployees.length, page]);

  const total = filteredEmployees.length;
  const maxPage = Math.max(1, Math.ceil(total / ROWS_PER_PAGE));
  const startIndex = (page - 1) * ROWS_PER_PAGE;
  const endIndex = Math.min(startIndex + ROWS_PER_PAGE, total);
  const pageRows = filteredEmployees.slice(startIndex, endIndex);

  const toggleSelection = (employeeId) => {
    setSelectedIds((prev) =>
      prev.includes(employeeId) ? prev.filter((id) => id !== employeeId) : [...prev, employeeId]
    );
  };

  const handleAssign = async () => {
    if (!selectedIds.length || !companyId) return;

    try {
      setAssigning(true);
      await Promise.all(selectedIds.map((employeeId) => employeesApi.assignEmployee(employeeId, companyId)));
      await onAssigned?.();
    } finally {
      setAssigning(false);
      onClose?.();
    }
  };

  const handleOpenMenu = (event, row) => {
    event.stopPropagation();
    setMenuAnchor(event.currentTarget);
    setMenuRow(row);
  };

  const handleCloseMenu = () => {
    setMenuAnchor(null);
    setMenuRow(null);
  };

  const handleViewProfile = () => {
    if (menuRow?.id) {
      navigate(`/employees/${menuRow.id}`);
    }
    handleCloseMenu();
    onClose?.();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="md"
      PaperProps={{
        sx: {
          borderRadius: "12px",
          border: "1px solid #DEDEDE",
          overflow: "hidden",
        },
      }}
    >
      <Box sx={{ px: "20px", pt:"20px",pb:"16px", borderBottom: "1px solid #DEDEDE", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Typography sx={{ fontSize: "18px", fontWeight: 600, lineHeight: "20px", letterSpacing: "0.54px", color: "#141414" }}>Unassigned Labor</Typography>
        <IconButton onClick={onClose} size="small" sx={{ color: "#141414" }}>
          <CloseIcon />
        </IconButton>
      </Box>

      <Box sx={{ py: "24px", px: "20px" }}>
        <Box sx={{ border: "1px solid #DEDEDE", borderRadius: "10px", overflow: "hidden" }}>
          <Box sx={{ p: "10px 12px", borderBottom: "1px solid #DEDEDE", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
            <TextField
              placeholder="Search for application id, name..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              size="small"
              fullWidth
              sx={{
                maxWidth: "420px",

                "& .MuiOutlinedInput-root": {
                  height: "40px",
                  borderRadius: "8px",

                  // Default border
                  "& fieldset": {
                    borderColor: "transparent",
                  },

                  // Hover border
                  "&:hover fieldset": {
                    borderColor: "transparent",
                  },

                  // Focus border
                  "&.Mui-focused fieldset": {
                    borderColor: "transparent",
                  },
                },
              }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ color: "#9CA3AF", fontSize: 18 }} />
                  </InputAdornment>
                ),
              }}
            />

            <Box sx={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
              <Typography sx={{ fontSize: "12px", color: "#757575" }}>
                {total ? `${startIndex + 1}-${endIndex} of ${total}` : "0-0 of 0"}
              </Typography>
              <IconButton
                size="small"
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={page <= 1}
                sx={{ border: "1px solid #DEDEDE", borderRadius: "8px", width: 30, height: 30 }}
              >
                <ChevronLeftIcon fontSize="small" />
              </IconButton>
              <IconButton
                size="small"
                onClick={() => setPage((prev) => Math.min(maxPage, prev + 1))}
                disabled={page >= maxPage}
                sx={{ border: "1px solid #DEDEDE", borderRadius: "8px", width: 30, height: 30 }}
              >
                <ChevronRightIcon fontSize="small" />
              </IconButton>
            </Box>
          </Box>

          <Table size="small" sx={{ minWidth: 760 }}>
            <TableHead>
              <TableRow sx={{ backgroundColor: "#FAFAFA" }}>
                <TableCell sx={{ width: 40, borderBottom: "1px solid #DEDEDE" }} />
                <TableCell sx={{ fontSize: "10px", color: "#6B7280", borderBottom: "1px solid #DEDEDE" }}>Employee ID</TableCell>
                <TableCell sx={{ fontSize: "10px", color: "#6B7280", borderBottom: "1px solid #DEDEDE" }}>Employee Name</TableCell>
                <TableCell sx={{ fontSize: "10px", color: "#6B7280", borderBottom: "1px solid #DEDEDE" }}>Trade</TableCell>
                <TableCell sx={{ fontSize: "10px", color: "#6B7280", borderBottom: "1px solid #DEDEDE" }}>Rate</TableCell>
                <TableCell align="center" sx={{ width: 60, fontSize: "10px", color: "#6B7280", borderBottom: "1px solid #DEDEDE" }}>Action</TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                    <CircularProgress size={20} />
                  </TableCell>
                </TableRow>
              ) : pageRows.length ? (
                pageRows.map((row) => (
                  <TableRow key={row.id} hover>
                    <TableCell sx={{ borderBottom: "1px solid #DEDEDE" }}>
                      <Checkbox
                        size="small"
                        checked={selectedIds.includes(row.id)}
                        onChange={() => toggleSelection(row.id)}
                      />
                    </TableCell>
                    <TableCell sx={{ fontSize: "12px", color: "#6B7280", borderBottom: "1px solid #DEDEDE" }}>{row.employeeId}</TableCell>
                    <TableCell sx={{ fontSize: "12px", color: "#6B7280", borderBottom: "1px solid #DEDEDE" }}>{row.name}</TableCell>
                    <TableCell sx={{ fontSize: "12px", color: "#6B7280", borderBottom: "1px solid #DEDEDE" }}>{row.trade}</TableCell>
                    <TableCell sx={{ fontSize: "12px", color: "#6B7280", borderBottom: "1px solid #DEDEDE" }}>{row.rate}</TableCell>
                    <TableCell align="center" sx={{ borderBottom: "1px solid #DEDEDE", ...ACTION_CELL_SX }}>
                      <IconButton
                        size="small"
                        onClick={(event) => handleOpenMenu(event, row)}
                        sx={ACTION_ICON_BUTTON_SX}
                      >
                        <MoreVertIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4, color: "#6B7280" , borderBottom: "none", fontSize: "12px" }}>
                    No unassigned employees found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Box>
      </Box>

      <Box sx={{ p: "16px 20px 20px", borderTop: "1px solid #DEDEDE", display: "flex", justifyContent: "flex-end" }}>
        <Button
          onClick={handleAssign}
          disabled={!selectedIds.length || assigning}
          variant="contained"
          sx={{
            textTransform: "none",
            minWidth: "78px",
            height: "32px",
            borderRadius: "8px",
            fontSize: "12px",
            boxShadow: "none",
            backgroundColor: "#2563EB",
            "&:hover": {
              backgroundColor: "#1D4ED8",
              boxShadow: "none",
            },
          }}
        >
          {assigning ? <CircularProgress size={18} color="inherit" /> : "Assignee"}
        </Button>
      </Box>

      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleCloseMenu}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        PaperProps={{
          sx: {
            minWidth: 126,
            borderRadius: "12px",
            boxShadow: "0 8px 24px rgba(17, 24, 39, 0.14)",
            mt: "6px",
          },
        }}
      >
        <MenuItem onClick={handleViewProfile}>
          <VisibilityOutlinedIcon fontSize="small" sx={{ mr: 1, color: "#6B7280" }} />
          <Typography sx={{ fontSize: "14px", color: "#6B7280" }}>View Profile</Typography>
        </MenuItem>
      </Menu>
    </Dialog>
  );
}

export default AssignEmployeeDialog;
