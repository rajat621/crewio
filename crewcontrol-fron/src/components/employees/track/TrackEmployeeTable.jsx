
// import { useState } from "react";
// import {
//   Box,
//   Divider,
//   IconButton,
//   InputAdornment,
//   Table,
//   TableBody,
//   TableCell,
//   TableHead,
//   TableRow,
//   TextField,
//   Typography,
//   Chip,
// } from "@mui/material";

// import SearchIcon from "@mui/icons-material/Search";
// import employeesData from "../../../data/employees";

// const STATUS_CONFIG = {
//   present: { label: "Present", bg: "#DCFCE7", color: "#15803D" },
//   "on-leave": { label: "On Leave", bg: "#FEF3C7", color: "#92400E" },
//   absent: { label: "Absent", bg: "#FECACA", color: "#DC2626" },
// };

// function TrackEmployeeTable() {
//   const [search, setSearch] = useState("");

//   const filtered = employeesData.filter((e) =>
//     e.name?.toLowerCase().includes(search.toLowerCase())
//   );

//   return (
//     <Box
//       sx={{
//         bgcolor: "#FFFFFF",
//         border: "1px solid",
//         borderColor: "divider",
//         borderRadius: 1,
//         height: "100%",
//         display: "flex",
//         flexDirection: "column",
//         overflow: "hidden",
//       }}
//     >
//       {/* ================= HEADER (MATCHES EMPLOYEE DETAIL) ================= */}
//       <Box sx={{ px: 2.5, py: 2 }}>
//         <Box
//           sx={{
//             display: "flex",
//             justifyContent: "space-between",
//             alignItems: "center",
//             mb: 2,
//           }}
//         >
          
//           <Typography fontSize={18} fontWeight={600}>
//             Employee&apos;s
//           </Typography>

//           <Typography fontSize={18} color="text.secondary">
//             {filtered.length}/{employeesData.length}
//           </Typography>
//         </Box>

//         <TextField
//           variant="standard"
//           placeholder="Search for application name..."
//           value={search}
//           onChange={(e) => setSearch(e.target.value)}
//           fullWidth
//           InputProps={{
//             disableUnderline: true,
//             startAdornment: (
//               <InputAdornment position="start">
//                 <SearchIcon fontSize="small" />
//               </InputAdornment>
//             ),
//           }}
//         />
//       </Box>

//       <Divider />

//       {/* ================= TABLE ================= */}
//       <Box sx={{ flex: 1, overflowY: "auto" }}>
//         <Table stickyHeader>
//           <TableHead>
//             <TableRow sx={{ height: 32 }}>
//               <TableCell
//                 sx={{
//                   fontSize: 12,
//                   fontWeight: 500,
//                   color: "text.secondary",
//                 }}
//               >
//                 Employee Name
//               </TableCell>

//               <TableCell
//                 align="center"
//                 sx={{
//                   fontSize: 12,
//                   fontWeight: 500,
//                   color: "text.secondary",
//                 }}
//               >
//                 Status
//               </TableCell>
//             </TableRow>
//           </TableHead>

//           <TableBody>
//             {filtered.map((row) => {
//               const cfg =
//                 STATUS_CONFIG[row.attendanceStatus] || {
//                   label: "Unknown",
//                   bg: "#E5E7EB",
//                   color: "#374151",
//                 };

//               return (
//                 <TableRow key={row.id} sx={{ height: 44 }}>
//                   <TableCell sx={{ fontSize: 12 }}>
//                     {row.name}
//                   </TableCell>

//                   <TableCell align="center">
//                     <Chip
//                       label={cfg.label}
//                       sx={{
//                         height: 22,
//                         px: 1.5,
//                         fontSize: 12,
//                         bgcolor: cfg.bg,
//                         color: cfg.color,
//                       }}
//                     />
//                   </TableCell>
//                 </TableRow>
//               );
//             })}
//           </TableBody>
//         </Table>
//       </Box>
//     </Box>
//   );
// }

// export default TrackEmployeeTable;
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
import employeesData from "../../../data/employees";

// ✅ IMPORT UNIVERSAL TABLE STYLES
import {
  HEADER_CELL_SX,
  BODY_CELL_SX,
  ROW_SX,
} from "../../table/tableUtils";

const STATUS_CONFIG = {
  present: { label: "Present", bg: "#DCFCE7", color: "#15803D" },
  "on-leave": { label: "On Leave", bg: "#FEF3C7", color: "#92400E" },
  absent: { label: "Absent", bg: "#FECACA", color: "#DC2626" },
};

function TrackEmployeeTable() {
  const [search, setSearch] = useState("");

  const filtered = employeesData.filter((e) =>
    e.name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Box
      sx={{
        bgcolor: "#FFFFFF",
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
            {filtered.length}/{employeesData.length}
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
                  bg: "#E5E7EB",
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
