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

// One fixed column set for every view - default (no KPI card active) and
// each of Present/Absent/On Leave used to show a different, reduced subset
// (e.g. the "present" filter dropped Total Leave/Total Absent entirely,
// "absent" dropped Total Work Hour/Total Present/Total Leave, etc.), which
// made the same employee's totals look inconsistent depending on which
// card was clicked. All of these read from the selectedMonth* fields (see
// employee.controller.js's getEmployeeAttendancePage), so they already
// follow whichever month is selected in the filter regardless of which
// KPI card (if any) is active - only the row LIST itself is scoped to
// today by the KPI card (statusFilter resolves against getUaeDayBounds).
const COLUMNS = [
  { key: "id", label: "Employee ID" },
  { key: "name", label: "Employee Name" },
  { key: "selectedMonthWorkHours", label: "Total Work Hour" },
  { key: "currentCheckIn", label: "Check-In Time" },
  { key: "currentCheckOut", label: "Check-Out Time" },
  { key: "selectedMonthPresentCount", label: "Total Present" },
  { key: "selectedMonthLeaveCount", label: "Total Leave" },
  { key: "selectedMonthAbsentCount", label: "Total Absent" },
  { key: "attendanceStatus", label: "Status", align: "center" },
  { key: "action", label: "Action", align: "center" },
];

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
        <TableHeader columns={COLUMNS} />
        <TableBody>
          {rows.map((row) => (
            <AttendanceRow
              key={row.id}
              row={row}
              columns={COLUMNS}
              onViewProfile={onViewProfile}
              onChat={onChat}
            />
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
