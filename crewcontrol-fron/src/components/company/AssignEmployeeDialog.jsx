import { useEffect, useState } from "react";
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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ACTION_CELL_SX, ACTION_ICON_BUTTON_SX } from "../table/tableUtils";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import { useNavigate } from "react-router-dom";
import { employeesApi } from "../../api/employees";
import { normalizeListResponse } from "../../utils/apiResponseNormalizer";
import { queryKeys } from "../../queryKeys";

const ROWS_PER_PAGE = 5;
const SEARCH_DEBOUNCE_MS = 300;

function useDebouncedValue(value, delayMs) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

const mapEmployeeRow = (employee) => ({
  id: employee?._id,
  employeeId: employee?.employeeId || employee?._id || "-",
  name:
    `${employee?.firstName || ""} ${employee?.lastName || ""}`.trim() ||
    employee?.name ||
    "-",
  trade: employee?.trade || employee?.position || "-",
  rate: Number(employee?.ratePerHour || employee?.salary || 0).toFixed(2),
});

function AssignEmployeeDialog({ open, onClose, companyId, onAssigned }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [assigning, setAssigning] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState([]);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [menuRow, setMenuRow] = useState(null);

  const debouncedQuery = useDebouncedValue(query.trim(), SEARCH_DEBOUNCE_MS);

  // Adjusted during render (React's documented pattern for "reset state
  // when a value changes between renders") rather than in a useEffect -
  // avoids an extra render-then-effect round trip for what's otherwise a
  // pure "does this differ from last time" comparison.
  const [prevDebouncedQuery, setPrevDebouncedQuery] = useState(debouncedQuery);
  if (debouncedQuery !== prevDebouncedQuery) {
    setPrevDebouncedQuery(debouncedQuery);
    // Resets to page 1 whenever the (debounced) search term actually
    // changes - staying on e.g. page 3 of an old, wider result set while a
    // narrower one has only 1 page would otherwise show an empty page with
    // working Previous/Next buttons pointing nowhere useful.
    setPage(1);
  }

  // Same render-time-adjustment pattern: reset transient dialog state (not
  // the debounce itself) each time it opens, so a previous open's
  // search/page/selection never leaks into the next one.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setQuery("");
      setPage(1);
      setSelectedIds([]);
    }
  }

  // Same predicate the "Worker Unassigned" KPI now reads directly
  // (employee.controller.js's getEmployeeStats unassignedActive facet) -
  // status: 'active' + assignedCompanyId: 'unassigned' (company is null/
  // missing). Server-side search + pagination: previously this fetched a
  // single capped page (limit: 200) and searched/paginated only within it
  // client-side, which is exactly backwards from what the dashboard counts
  // - a tenant with more unassigned employees than fit in view could never
  // see or search the rest here. React Query's own key-based caching means
  // typing the same term twice, or two dialogs open with the same filters,
  // never issue duplicate network requests, and a slow response for an
  // abandoned older search term can only ever populate ITS OWN cache entry
  // - never overwrite what a newer, faster-resolving search term is
  // currently displaying.
  const { data, isFetching } = useQuery({
    queryKey: queryKeys.employees.list({
      scope: "unassigned-popup",
      search: debouncedQuery,
      page,
      limit: ROWS_PER_PAGE,
    }),
    queryFn: async () => {
      const response = await employeesApi.getEmployees({
        status: "active",
        assignedCompanyId: "unassigned",
        search: debouncedQuery || undefined,
        page,
        limit: ROWS_PER_PAGE,
      });
      const { items, meta } = normalizeListResponse(response);
      return { rows: items.map(mapEmployeeRow), total: Number(meta?.total) || 0 };
    },
    enabled: open,
    placeholderData: (previous) => previous,
  });

  const pageRows = data?.rows || [];
  const total = data?.total || 0;
  const maxPage = Math.max(1, Math.ceil(total / ROWS_PER_PAGE));
  const startIndex = total ? (page - 1) * ROWS_PER_PAGE + 1 : 0;
  const endIndex = Math.min(page * ROWS_PER_PAGE, total);

  const toggleSelection = (employeeId) => {
    setSelectedIds((prev) =>
      prev.includes(employeeId) ? prev.filter((id) => id !== employeeId) : [...prev, employeeId]
    );
  };

  // Bulk-assign fires one request per selected employee. Chunking caps how
  // many of those are ever in flight at once - a large selection (hundreds
  // of employees) previously fired them all concurrently in a single
  // Promise.all with no upper bound.
  const ASSIGN_CHUNK_SIZE = 10;

  const handleAssign = async () => {
    if (!selectedIds.length || !companyId) return;

    try {
      setAssigning(true);
      for (let i = 0; i < selectedIds.length; i += ASSIGN_CHUNK_SIZE) {
        const chunk = selectedIds.slice(i, i + ASSIGN_CHUNK_SIZE);
        await Promise.all(chunk.map((employeeId) => employeesApi.assignEmployee(employeeId, companyId)));
      }
      // Keeps every other consumer of "who's unassigned"/"who's in this
      // company" in sync without a full page reload: this dialog's own
      // list (so the just-assigned employees actually disappear from it if
      // reopened), the Employees page's "Worker Unassigned" KPI and table,
      // and the Companies page's per-company worker counts.
      await queryClient.invalidateQueries({ queryKey: queryKeys.employees.all });
      await queryClient.invalidateQueries({ queryKey: ["dashboard", "summary"] });
      await queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
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
          border: "1px solid var(--border-card)",
          overflow: "hidden",
        },
      }}
    >
      <Box sx={{ px: "20px", pt:"20px",pb:"16px", borderBottom: "1px solid var(--border-card)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Typography sx={{ fontSize: "18px", fontWeight: 600, lineHeight: "20px", letterSpacing: "0.54px", color: "var(--text-primary)" }}>Unassigned Labor</Typography>
        <IconButton onClick={onClose} size="small" sx={{ color: "var(--text-primary)" }}>
          <CloseIcon />
        </IconButton>
      </Box>

      <Box sx={{ py: "24px", px: "20px" }}>
        <Box sx={{ border: "1px solid var(--border-card)", borderRadius: "10px", overflow: "hidden" }}>
          <Box sx={{ p: "10px 12px", borderBottom: "1px solid var(--border-card)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
            <TextField
              placeholder="Search for employee id, name..."
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
                    <SearchIcon sx={{ color: "var(--text-disabled)", fontSize: 18 }} />
                  </InputAdornment>
                ),
                endAdornment: isFetching ? (
                  <InputAdornment position="end">
                    <CircularProgress size={14} sx={{ color: "var(--text-disabled)" }} />
                  </InputAdornment>
                ) : null,
              }}
            />

            <Box sx={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
              <Typography sx={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                {total ? `${startIndex}-${endIndex} of ${total}` : "0-0 of 0"}
              </Typography>
              <IconButton
                size="small"
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={page <= 1}
                sx={{ border: "1px solid var(--border-card)", borderRadius: "8px", width: 30, height: 30 }}
              >
                <ChevronLeftIcon fontSize="small" />
              </IconButton>
              <IconButton
                size="small"
                onClick={() => setPage((prev) => Math.min(maxPage, prev + 1))}
                disabled={page >= maxPage}
                sx={{ border: "1px solid var(--border-card)", borderRadius: "8px", width: 30, height: 30 }}
              >
                <ChevronRightIcon fontSize="small" />
              </IconButton>
            </Box>
          </Box>

          <Table size="small" sx={{ minWidth: 760 }}>
            <TableHead>
              <TableRow sx={{ backgroundColor: "var(--bg-surface)" }}>
                <TableCell sx={{ width: 40, borderBottom: "1px solid var(--border-card)" }} />
                <TableCell sx={{ fontSize: "10px", color: "var(--text-secondary)", borderBottom: "1px solid var(--border-card)" }}>Employee ID</TableCell>
                <TableCell sx={{ fontSize: "10px", color: "var(--text-secondary)", borderBottom: "1px solid var(--border-card)" }}>Employee Name</TableCell>
                <TableCell sx={{ fontSize: "10px", color: "var(--text-secondary)", borderBottom: "1px solid var(--border-card)" }}>Trade</TableCell>
                <TableCell sx={{ fontSize: "10px", color: "var(--text-secondary)", borderBottom: "1px solid var(--border-card)" }}>Rate</TableCell>
                <TableCell align="center" sx={{ width: 60, fontSize: "10px", color: "var(--text-secondary)", borderBottom: "1px solid var(--border-card)" }}>Action</TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {isFetching && !pageRows.length ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                    <CircularProgress size={20} />
                  </TableCell>
                </TableRow>
              ) : pageRows.length ? (
                pageRows.map((row) => (
                  <TableRow key={row.id} hover>
                    <TableCell sx={{ borderBottom: "1px solid var(--border-card)" }}>
                      <Checkbox
                        size="small"
                        checked={selectedIds.includes(row.id)}
                        onChange={() => toggleSelection(row.id)}
                      />
                    </TableCell>
                    <TableCell sx={{ fontSize: "12px", color: "var(--text-secondary)", borderBottom: "1px solid var(--border-card)" }}>{row.employeeId}</TableCell>
                    <TableCell sx={{ fontSize: "12px", color: "var(--text-secondary)", borderBottom: "1px solid var(--border-card)" }}>{row.name}</TableCell>
                    <TableCell sx={{ fontSize: "12px", color: "var(--text-secondary)", borderBottom: "1px solid var(--border-card)" }}>{row.trade}</TableCell>
                    <TableCell sx={{ fontSize: "12px", color: "var(--text-secondary)", borderBottom: "1px solid var(--border-card)" }}>{row.rate}</TableCell>
                    <TableCell align="center" sx={{ borderBottom: "1px solid var(--border-card)", ...ACTION_CELL_SX }}>
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
                  <TableCell colSpan={6} align="center" sx={{ py: 4, color: "var(--text-secondary)" , borderBottom: "none", fontSize: "12px" }}>
                    {debouncedQuery ? "No employees found" : "No unassigned employees found"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Box>
      </Box>

      <Box sx={{ p: "16px 20px 20px", borderTop: "1px solid var(--border-card)", display: "flex", justifyContent: "flex-end" }}>
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
            backgroundColor: "var(--color-primary)",
            "&:hover": {
              backgroundColor: "var(--color-primary)",
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
          <VisibilityOutlinedIcon fontSize="small" sx={{ mr: 1, color: "var(--text-secondary)" }} />
          <Typography sx={{ fontSize: "14px", color: "var(--text-secondary)" }}>View Profile</Typography>
        </MenuItem>
      </Menu>
    </Dialog>
  );
}

export default AssignEmployeeDialog;
