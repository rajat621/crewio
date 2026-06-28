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
// } from "@mui/material";

// import SearchIcon from "@mui/icons-material/Search";
// import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
// import ChevronRightIcon from "@mui/icons-material/ChevronRight";

// import EmployeeRow from "./EmployeeRow";

// const COLUMNS = [
//   "Employee ID",
//   "Employee Name",
//   "Phone No.",
//   "Trade",
//   "Rate",
//   "Joined On",
//   "Action",
// ];

// const EmployeesTable = ({
//   employees,
//   searchQuery,
//   onSearchChange,
//   page,
//   rowsPerPage,
//   totalCount,
//   onPageChange,
// }) => {
//   const start = totalCount ? (page - 1) * rowsPerPage + 1 : 0;
//   const end = Math.min(page * rowsPerPage, totalCount);

//   return (
//     <TableContainer
//       component={Box}
//       sx={{
//         bgcolor: "var(--bg-surface)",
//         border: "1px solid",
//         borderColor: "divider",
//         borderRadius: 1,
//         overflow: "hidden",
        
//       }}
//     >
//       {/* Toolbar */}
//       <Box
//         sx={{
//           display: "flex",
//           alignItems: "center",
//           justifyContent: "space-between",
//           px: 2.5,
//           py: 2,
//         }}
//       >
//         {/* Search (no stroke) */}
//         <TextField
//           variant="standard"
//           value={searchQuery}
//           onChange={(e) => onSearchChange(e.target.value)}
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

//         {/* Pagination */}
//         <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
//           <Typography
//             sx={{ fontSize: "12px", color: "text.secondary" }}
//           >
//             {start}-{end} of {totalCount}
//           </Typography>

//           <IconButton
//             size="small"
//             disabled={page === 1}
//             onClick={() => onPageChange(page - 1)}
//             sx={{
//               border: "1px solid",
//               borderColor: "divider",
//               borderRadius: 1,
//             }}
//           >
//             <ChevronLeftIcon fontSize="small" />
//           </IconButton>

//           <IconButton
//             size="small"
//             disabled={end >= totalCount}
//             onClick={() => onPageChange(page + 1)}
//             sx={{
//               border: "1px solid",
//               borderColor: "divider",
//               borderRadius: 1,
//             }}
//           >
//             <ChevronRightIcon fontSize="small" />
//           </IconButton>
//         </Box>
//       </Box>

//       <Divider />

//       {/* Table */}
//       <Table>
//         <TableHead>
//           <TableRow
//             sx={{
//               height: "32px", // ✅ HEADER ROW HEIGHT
//             }}
//           >
//             {COLUMNS.map((label) => (
//               <TableCell
//                 key={label}
//                 sx={{
//                   fontSize: "12px", // ✅ HEADER FONT SIZE
//                   fontWeight: 500,
//                   color: "text.secondary",
//                   py: 0, // important for exact height
//                   borderBottom: "1px solid",
//                   borderColor: "divider",
//                   whiteSpace: "nowrap",
//                 }}
//               >
//                 {label}
//               </TableCell>
//             ))}
//           </TableRow>
//         </TableHead>

//         <TableBody>
//           {employees.map((employee) => (
//             <EmployeeRow
//               key={employee.employeeId}
//               employee={employee}
//             />
//           ))}
//         </TableBody>
//       </Table>
//     </TableContainer>
//   );
// };

// export default EmployeesTable;
import UniversalTable from "../table/UniversalTable";
import EmployeeRow from "./EmployeeRow";

const COLUMNS = [
  { key: "id", label: "Employee ID" },
  { key: "name", label: "Employee Name" },
  { key: "phone", label: "Phone No." },
  { key: "trade", label: "Trade" },
  { key: "rate", label: "Rate" },
  { key: "joined", label: "Joined On" },
  { key: "action", label: "Action", align: "center" },
];

export default function EmployeesTable({ rows }) {
  return (
    <UniversalTable
      columns={COLUMNS}
      rows={rows}
      rowsPerPage={10}
      searchKeys={["id", "name", "trade"]}
      renderRow={(row) => <EmployeeRow key={row.id} row={row} />}
    />
  );
}

