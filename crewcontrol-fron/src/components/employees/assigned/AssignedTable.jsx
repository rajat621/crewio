// import { useState, useMemo } from "react";
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
// import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
// import ChevronRightIcon from "@mui/icons-material/ChevronRight";
// import MoreVertIcon from "@mui/icons-material/MoreVert";

// /* ===== STATUS ===== */
// const STATUS = {
//   ASSIGNED: "assigned",
//   ENDING_SOON: "ending-soon",
//   UNASSIGNED: "unassigned",
// };

// /* ===== STATUS CONFIG ===== */
// const STATUS_CONFIG = {
//   assigned: { label: "Assigned", bg: "#DCFCE7", color: "#15803D" },
//   "ending-soon": { label: "Ending Soon", bg: "#E5E7EB", color: "#374151" },
//   unassigned: { label: "Unassigned", bg: "#FECACA", color: "#DC2626" },
// };

// /* ===== CONSTANTS ===== */
// const COLUMNS = [
//   "Employee ID",
//   "Employee Name",
//   "Assigned Company",
//   "Project No.",
//   "Trade",
//   "Start Date",
//   "Rate",
//   "Status",
//   "Action",
// ];

// const ROWS = [
//   {
//     id: "WKNEL260101",
//     name: "Rakesh Patel",
//     company: "L&T",
//     project: "P1023",
//     trade: "Electrician",
//     startDate: "12 Aug 2023",
//     rate: "10.50",
//     status: STATUS.ASSIGNED,
//   },
//   {
//     id: "WKNEL260102",
//     name: "Sanjay Kumar",
//     company: "TATA Projects",
//     project: "P2045",
//     trade: "Welder",
//     startDate: "01 Jul 2023",
//     rate: "11.00",
//     status: STATUS.ENDING_SOON,
//   },
//   {
//     id: "WKNEL260103",
//     name: "Imran Khan",
//     company: "-",
//     project: "-",
//     trade: "Helper",
//     startDate: "-",
//     rate: "8.00",
//     status: STATUS.UNASSIGNED,
//   },
//   {
//     id: "WKNEL260104",
//     name: "Mahesh Yadav",
//     company: "Adani Infra",
//     project: "P3301",
//     trade: "Carpenter",
//     startDate: "05 Sep 2023",
//     rate: "9.75",
//     status: STATUS.ASSIGNED,
//   },
//   {
//     id: "WKNEL260105",
//     name: "Deepak Verma",
//     company: "MCC",
//     project: "P1199",
//     trade: "Plumber",
//     startDate: "20 Aug 2023",
//     rate: "10.00",
//     status: STATUS.ASSIGNED,
//   },
// ];

// const TOTAL_LABOUR = 20;

// /* ===== SHARED CELL STYLE ===== */
// const CELL_SX = { fontSize: 12, py: 0 };

// /* ===== ROW ===== */
// function AssignedTableRow({ row }) {
//   const { label, bg, color } = STATUS_CONFIG[row.status];

//   return (
//     <TableRow sx={{ height: 44 }}>
//       {[row.id, row.name, row.company, row.project, row.trade, row.startDate, row.rate].map(
//         (val, i) => (
//           <TableCell key={i} sx={CELL_SX}>
//             {val}
//           </TableCell>
//         )
//       )}

//       <TableCell align="center" sx={CELL_SX}>
//         <Chip
//           label={label}
//           size="small"
//           sx={{
//             height: 24,
//             px: 1.5,
//             fontSize: 12,
//             fontWeight: 500,
//             bgcolor: bg,
//             color,
//           }}
//         />
//       </TableCell>

//       <TableCell align="center" sx={CELL_SX}>
//         <IconButton size="small">
//           <MoreVertIcon fontSize="small" />
//         </IconButton>
//       </TableCell>
//     </TableRow>
//   );
// }

// /* ===== MAIN TABLE ===== */
// export default function AssignedTable({ activeKpi }) {
//   const [search, setSearch] = useState("");
//   const page = 1;
//   const rowsPerPage = 5;

//   /* 🔍 KPI + SEARCH FILTER */
//   const filteredRows = useMemo(() => {
//     let data = ROWS;

//     if (activeKpi) {
//       data = data.filter((row) => row.status === activeKpi);
//     }

//     if (!search) return data;

//     const q = search.toLowerCase();
//     return data.filter((r) =>
//       [r.id, r.name, r.company, r.trade].some(
//         (field) => field && field.toLowerCase().includes(q)
//       )
//     );
//   }, [search, activeKpi]);

//   const start = filteredRows.length ? (page - 1) * rowsPerPage + 1 : 0;
//   const end = Math.min(page * rowsPerPage, filteredRows.length || TOTAL_LABOUR);

//   return (
//     <TableContainer
//       component={Box}
//       sx={{
//         bgcolor: "#FFFFFF",
//         border: "1px solid",
//         borderColor: "divider",
//         borderRadius: 1,
//         overflow: "hidden",
//       }}
//     >
//       {/* TOOLBAR */}
//       <Box
//         sx={{
//           display: "flex",
//           justifyContent: "space-between",
//           alignItems: "center",
//           px: 2.5,
//           py: 2,
//         }}
//       >
//         <TextField
//           variant="standard"
//           value={search}
//           onChange={(e) => setSearch(e.target.value)}
//           placeholder="Search for employee id, name..."
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

//         <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
//           <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
//             {start}-{end} of {activeKpi ? filteredRows.length : TOTAL_LABOUR}
//           </Typography>

//           <IconButton
//             size="small"
//             sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1 }}
//           >
//             <ChevronLeftIcon fontSize="small" />
//           </IconButton>

//           <IconButton
//             size="small"
//             sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1 }}
//           >
//             <ChevronRightIcon fontSize="small" />
//           </IconButton>
//         </Box>
//       </Box>

//       <Divider />

//       {/* TABLE */}
//       <Table>
//         <TableHead>
//           <TableRow sx={{ height: 32 }}>
//             {COLUMNS.map((label) => (
//               <TableCell
//                 key={label}
//                 align={["Status", "Action"].includes(label) ? "center" : "left"}
//                 sx={{
//                   fontSize: 12,
//                   fontWeight: 500,
//                   py: 0,
//                   color: "text.secondary",
//                   whiteSpace: "nowrap",
//                 }}
//               >
//                 {label}
//               </TableCell>
//             ))}
//           </TableRow>
//         </TableHead>

//         <TableBody>
//           {filteredRows.map((row) => (
//             <AssignedTableRow key={row.id} row={row} />
//           ))}
//         </TableBody>
//       </Table>
//     </TableContainer>
//   );
// }
import UniversalTable from "../../table/UniversalTable";
import AssignedRow from "./AssignedRow";

const COLUMNS = [
  { key: "id", label: "Employee ID" },
  { key: "name", label: "Employee Name" },
  { key: "company", label: "Assigned Company" },
  { key: "project", label: "Project No." },
  { key: "trade", label: "Trade" },
  { key: "startDate", label: "Start Date" },
  { key: "rate", label: "Rate" },
  { key: "assignedStatus", label: "Status", align: "center" },
  { key: "action", label: "Action", align: "center" },
];

export default function AssignedTable({ rows = [], activeStatus }) {
  return (
    <UniversalTable
      columns={COLUMNS}
      rows={rows}
      rowsPerPage={5}
      kpiFilterKey={activeStatus}
      filterKey="assignedStatus"
      searchKeys={["id", "name", "trade"]}
      renderRow={(row) => <AssignedRow key={row.id} row={row} />}
    />
  );
}
