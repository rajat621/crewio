import { useMemo } from "react";
import {
  Box,
  Divider,
  IconButton,
  InputAdornment,
  Table,
  TableBody,
  TableContainer,
  TextField,
  Typography,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";

import TableHeader from "../../table/TableHeader";
import AttendanceRow from "./AttendanceRow";
import MonthFilterSelect from "../../common/MonthFilterSelect";

// Same column LAYOUT everywhere (default view and every Present/Absent/On
// Leave KPI card), but a different DATA SOURCE depending on which is
// active. The default (no KPI card) view follows the month dropdown -
// selectedMonth* (see employee.controller.js's getEmployeeAttendancePage),
// which tracks whatever `month` the caller passed. The three "Today" KPI
// cards are inherently about right now, so their totals must stay pinned
// to the REAL current calendar month (currentMonth*, computed server-side
// independent of the `month` param) regardless of what a user previously
// picked in the dropdown - otherwise "Present Today" could sit next to a
// "Total Present" figure for some unrelated past month still selected
// from an earlier session on this same page.
const getColumns = (activeStatus) => {
  const prefix = activeStatus ? "current" : "selected";
  return [
    { key: "id", label: "Employee ID" },
    { key: "name", label: "Employee Name" },
    { key: `${prefix}MonthWorkHours`, label: "Total Work Hour" },
    { key: "currentCheckIn", label: "Check-In Time" },
    { key: "currentCheckOut", label: "Check-Out Time" },
    { key: `${prefix}MonthPresentCount`, label: "Total Present" },
    { key: `${prefix}MonthLeaveCount`, label: "Total Leave" },
    { key: `${prefix}MonthAbsentCount`, label: "Total Absent" },
    { key: "attendanceStatus", label: "Status", align: "center" },
    { key: "action", label: "Action", align: "center" },
  ];
};

// Server-driven now: `rows` is already the current page's data, already
// filtered by `activeStatus` and `search` server-side (see
// employee.controller.js's getEmployeeAttendancePage and Employees.jsx's
// useEmployeeAttendancePage) - was previously a fully client-side table
// (its own local search/page state, filtering an already-capped-at-200
// array), which is why an employee beyond that first page could never
// appear here no matter what was searched for or which KPI card was
// active.
export default function AttendanceTable({
  rows = [],
  activeStatus,
  selectedMonth,
  onMonthChange,
  onViewProfile,
  onChat,
  page,
  onPageChange,
  total,
  rowsPerPage,
  search,
  onSearchChange,
}) {
  const columns = useMemo(() => getColumns(activeStatus), [activeStatus]);

  const totalPages = Math.max(1, Math.ceil(total / rowsPerPage));
  const start = total === 0 ? 0 : (page - 1) * rowsPerPage + 1;
  const end = total === 0 ? 0 : Math.min(page * rowsPerPage, total);

  return (
    <TableContainer
      component={Box}
      sx={{
        bgcolor: "var(--bg-surface)",
        border: "1px solid",
        borderColor: "var(--border-card)",
        borderRadius: 1,
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          px: 2.5,
          py: 2,
          gap: 2,
        }}
      >
        <TextField
          variant="standard"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search for application id, name..."
          sx={{ width: 320 }}
          InputProps={{
            disableUnderline: true,
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />

        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
          <MonthFilterSelect
            value={selectedMonth}
            onChange={onMonthChange}
            disabled={Boolean(activeStatus)}
          />

          <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
            {start}-{end} of {total}
          </Typography>

          <IconButton
            size="small"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page === 1}
            sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1 }}
          >
            <ChevronLeftIcon fontSize="small" />
          </IconButton>

          <IconButton
            size="small"
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page === totalPages || total === 0}
            sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1 }}
          >
            <ChevronRightIcon fontSize="small" />
          </IconButton>
        </Box>
      </Box>

      <Divider sx={{ borderColor: "var(--border-card)" }} />

      <Table>
        <TableHeader columns={columns} />
        <TableBody>
          {rows.map((row) => (
            <AttendanceRow
              key={row.id}
              row={row}
              columns={columns}
              onViewProfile={onViewProfile}
              onChat={onChat}
            />
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
