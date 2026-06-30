
import { useState } from "react";
import {
  Box,
  Divider,
  InputAdornment,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
  Chip,
} from "@mui/material";

import SearchIcon from "@mui/icons-material/Search";

// ✅ IMPORT UNIVERSAL TABLE STYLES
import {
  HEADER_CELL_SX,
  BODY_CELL_SX,
  ROW_SX,
} from "../../table/tableUtils";

const STATUS_CONFIG = {
  present: { label: "Present", bg: "var(--bg-success-soft)", color: "#15803D" },
  "on-leave": { label: "On Leave", bg: "var(--bg-warning-soft)", color: "#92400E" },
  absent: { label: "Absent", bg: "#FECACA", color: "var(--color-error)" },
};

function TrackEmployeeTable({ rows = [] }) {
  const [search, setSearch] = useState("");

  const filtered = rows.filter((row) =>
    String(row?.name || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Box
      sx={{
        bgcolor: "var(--bg-surface)",
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 1,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* ================= HEADER ================= */}
      <Box sx={{ px: 2.5, py: 2 }}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mb: 2,
          }}
        >
          <Typography fontSize={18} fontWeight={600}>
            Employee&apos;s
          </Typography>

          <Typography fontSize={18} color="text.secondary">
            {filtered.length}/{rows.length}
          </Typography>
        </Box>

        <TextField
          variant="standard"
          placeholder="Search for application name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          fullWidth
          InputProps={{
            disableUnderline: true,
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
      </Box>

      <Divider />

      {/* ================= TABLE ================= */}
      <Box sx={{ flex: 1, overflowY: "auto" }}>
        <Table stickyHeader>
          <TableHead>
            <TableRow sx={{ height: 32 }}>
              <TableCell sx={HEADER_CELL_SX}>
                Employee Name
              </TableCell>

              <TableCell align="center" sx={HEADER_CELL_SX}>
                Status
              </TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {filtered.map((row) => {
              const cfg =
                STATUS_CONFIG[row.attendanceStatus] || {
                  label: "Unknown",
                  bg: "var(--border-input)",
                  color: "#374151",
                };

              return (
                <TableRow key={row.id} sx={ROW_SX}>
                  <TableCell sx={BODY_CELL_SX}>
                    {row.name}
                  </TableCell>

                  <TableCell align="center" sx={BODY_CELL_SX}>
                    <Chip
                      label={cfg.label}
                      sx={{
                        height: 22,
                        px: 1.5,
                        fontSize: 12,
                        bgcolor: cfg.bg,
                        color: cfg.color,
                      }}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Box>
    </Box>
  );
}

export default TrackEmployeeTable;

