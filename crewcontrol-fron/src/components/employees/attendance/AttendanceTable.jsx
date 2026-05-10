// import { useState } from "react";
// import {
//   Box,
//   Divider,
//   IconButton,
//   InputAdornment,
//   Table,
//   TableBody,
//   TableCell,
//   TableContainer,
//   TableHead,
//   TableRow,
//   TextField,
//   Typography,
//   Chip,
// } from "@mui/material";

// import SearchIcon from "@mui/icons-material/Search";
// import MoreVertIcon from "@mui/icons-material/MoreVert";

// import { STATUS_CONFIG } from "./attendanceUtils";
// import { CELL_SX, HEADER_CELL_SX } from "../../table/tableUtils";

// function AttendanceTable({ rows }) {
//   const [search, setSearch] = useState("");

//   const visibleRows = rows.filter((r) =>
//     [r.id, r.name].join(" ").toLowerCase().includes(search.toLowerCase())
//   );

//   return (
//     <TableContainer component={Box}>
//       {/* Toolbar */}
//       <Box
//         sx={{
//           display: "flex",
//           justifyContent: "space-between",
//           px: 2.5,
//           py: 2,
//         }}
//       >
//         <TextField
//           variant="standard"
//           placeholder="Search for employee id, name..."
//           value={search}
//           onChange={(e) => setSearch(e.target.value)}
//           sx={{ width: 320 }}
//           InputProps={{
//             disableUnderline: true,
//             startAdornment: (
//               <InputAdornment position="start">
//                 <SearchIcon fontSize="small" />
//               </InputAdornment>
//             ),
//           }}
//         />

//         <Typography fontSize={12}>
//           {visibleRows.length} rows
//         </Typography>
//       </Box>

//       <Divider />

//       <Table>
//         <TableHead>
//           <TableRow sx={{ height: 32 }}>
//             {[
//               "Employee ID",
//               "Employee Name",
//               "Check-in Time",
//               "Check-out Time",
//               "Total Works",
//               "Total Absent",
//               "Status",
//               "Action",
//             ].map((h) => (
//               <TableCell
//                 key={h}
//                 align={["Status", "Action"].includes(h) ? "center" : "left"}
//                 sx={HEADER_CELL_SX}
//               >
//                 {h}
//               </TableCell>
//             ))}
//           </TableRow>
//         </TableHead>

//         <TableBody>
//           {visibleRows.map((row) => {
//             const cfg = STATUS_CONFIG[row.status];
//             return (
//               <TableRow key={row.id} sx={{ height: 44 }}>
//                 <TableCell sx={CELL_SX}>{row.id}</TableCell>
//                 <TableCell sx={CELL_SX}>{row.name}</TableCell>
//                 <TableCell sx={CELL_SX}>{row.checkIn}</TableCell>
//                 <TableCell sx={CELL_SX}>{row.checkOut}</TableCell>
//                 <TableCell sx={CELL_SX}>{row.totalWorks}</TableCell>
//                 <TableCell sx={CELL_SX}>{row.totalAbsent}</TableCell>

//                 <TableCell align="center" sx={CELL_SX}>
//                   <Chip
//                     label={cfg.label}
//                     sx={{
//                       height: 24,
//                       px: 1.5,
//                       fontSize: 12,
//                       bgcolor: cfg.bg,
//                       color: cfg.color,
//                     }}
//                   />
//                 </TableCell>

//                 <TableCell align="center" sx={CELL_SX}>
//                   <IconButton size="small">
//                     <MoreVertIcon fontSize="small" />
//                   </IconButton>
//                 </TableCell>
//               </TableRow>
//             );
//           })}
//         </TableBody>
//       </Table>
//     </TableContainer>
//   );
// }

// export default AttendanceTable;
import UniversalTable from "../../table/UniversalTable";
import AttendanceRow from "./AttendanceRow";

const COLUMNS = [
  { key: "id", label: "Employee ID" },
  { key: "name", label: "Employee Name" },
  { key: "checkIn", label: "Check-in Time" },
  { key: "checkOut", label: "Check-out Time" },
  { key: "totalWorks", label: "Total Works" },
  { key: "totalAbsent", label: "Total Absent" },
  { key: "attendanceStatus", label: "Status", align: "center" },
  { key: "action", label: "Action", align: "center" },
];

export default function AttendanceTable({ rows = [], activeStatus }) {
  return (
    <UniversalTable
      columns={COLUMNS}
      rows={rows}
      rowsPerPage={5}
      kpiFilterKey={activeStatus}
      filterKey="attendanceStatus"   // ✅ FIX
      searchKeys={["id", "name"]}
      renderRow={(row) => (
        <AttendanceRow key={row.id} row={row} />
      )}
    />
  );
}
