import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Divider,
  IconButton,
  InputAdornment,
  MenuItem,
  Select,
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

const CURRENT_MONTH = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;

const getMonthOptions = () => {
  const year = new Date().getFullYear();

  return Array.from({ length: 12 }, (_, index) => {
    const value = `${year}-${String(index + 1).padStart(2, "0")}`;
    const label = new Date(year, index, 1).toLocaleDateString("en-US", {
      month: "long",
    });

    return { value, label };
  });
};

const getColumns = (activeStatus) => {
  if (activeStatus === "present") {
    return [
      { key: "id", label: "Employee ID" },
      { key: "name", label: "Employee Name" },
      { key: "currentMonthWorkHours", label: "Hour of work" },
      { key: "currentCheckIn", label: "Check-In Time" },
      { key: "currentCheckOut", label: "Check-Out Time" },
      { key: "currentMonthPresentCount", label: "Total Present" },
      { key: "attendanceStatus", label: "Status", align: "center" },
      { key: "action", label: "Action", align: "center" },
    ];
  }

  if (activeStatus === "absent") {
    return [
      { key: "id", label: "Employee ID" },
      { key: "name", label: "Employee Name" },
      { key: "currentCheckIn", label: "Check-in Time" },
      { key: "currentCheckOut", label: "Check-out Time" },
      { key: "currentMonthAbsentCount", label: "Total Absent" },
      { key: "attendanceStatus", label: "Status", align: "center" },
      { key: "action", label: "Action", align: "center" },
    ];
  }

  if (activeStatus === "on-leave") {
    return [
      { key: "id", label: "Employee ID" },
      { key: "name", label: "Employee Name" },
      { key: "currentCheckIn", label: "Check-in Time" },
      { key: "currentCheckOut", label: "Check-out Time" },
      { key: "currentMonthLeaveCount", label: "Total Leave" },
      { key: "attendanceStatus", label: "Status", align: "center" },
      { key: "action", label: "Action", align: "center" },
    ];
  }

  return [
    { key: "id", label: "Employee ID" },
    { key: "name", label: "Employee Name" },
    { key: "selectedMonthWorkHours", label: "Total Work Hour" },
    { key: "selectedMonthPresentCount", label: "Total Present" },
    { key: "selectedMonthLeaveCount", label: "Total Leave" },
    { key: "selectedMonthAbsentCount", label: "Total Absent" },
    { key: "attendanceStatus", label: "Status", align: "center" },
    { key: "action", label: "Action", align: "center" },
  ];
};

export default function AttendanceTable({
  rows = [],
  activeStatus,
  selectedMonth,
  onMonthChange,
  onViewProfile,
  onChat,
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const monthOptions = useMemo(() => getMonthOptions(), []);
  const effectiveMonth = activeStatus ? CURRENT_MONTH : selectedMonth;
  const columns = useMemo(() => getColumns(activeStatus), [activeStatus]);

  const filteredRows = useMemo(() => {
    let data = rows;

    if (activeStatus) {
      data = data.filter((row) => row.attendanceStatus === activeStatus);
    }

    if (!search) {
      return data;
    }

    const query = search.toLowerCase();
    return data.filter((row) =>
      [row.id, row.name].some((value) => String(value || "").toLowerCase().includes(query))
    );
  }, [rows, activeStatus, search]);

  useEffect(() => {
    setPage(1);
  }, [activeStatus, search, effectiveMonth]);

  const rowsPerPage = 5;
  const total = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(total / rowsPerPage));
  const currentPage = Math.min(page, totalPages);
  const visibleRows = filteredRows.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);
  const start = total === 0 ? 0 : (currentPage - 1) * rowsPerPage + 1;
  const end = total === 0 ? 0 : Math.min(currentPage * rowsPerPage, total);

  return (
    <TableContainer
      component={Box}
      sx={{
        bgcolor: "#FFFFFF",
        border: "1px solid",
        borderColor: "#DEDEDE",
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
          onChange={(event) => setSearch(event.target.value)}
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
          <Select
            size="small"
            value={effectiveMonth}
            onChange={(event) => onMonthChange?.(event.target.value)}
            disabled={Boolean(activeStatus)}
            sx={{ height: 32, minWidth: 112 }}
          >
            {monthOptions.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </Select>

          <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
            {start}-{end} of {total}
          </Typography>

          <IconButton
            size="small"
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            disabled={currentPage === 1}
            sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1 }}
          >
            <ChevronLeftIcon fontSize="small" />
          </IconButton>

          <IconButton
            size="small"
            onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
            disabled={currentPage === totalPages || total === 0}
            sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1 }}
          >
            <ChevronRightIcon fontSize="small" />
          </IconButton>
        </Box>
      </Box>

      <Divider sx={{ borderColor: "#DEDEDE" }} />

      <Table>
        <TableHeader columns={columns} />
        <TableBody>
          {visibleRows.map((row) => (
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
