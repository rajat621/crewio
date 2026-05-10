// import { TableRow, TableCell, Chip } from "@mui/material";
// import { CELL_SX } from "../../table/tableUtils";

// const STATUS = {
//   present: { label: "Present", bg: "#DCFCE7", color: "#15803D" },
//   "on-leave": { label: "On Leave", bg: "#FEF3C7", color: "#92400E" },
//   absent: { label: "Absent", bg: "#FECACA", color: "#DC2626" },
// };

// export default function TrackEmployeeRow({ row }) {
//   const cfg = STATUS[row.liveStatus];

//   return (
//     <TableRow sx={{ height: 44 }}>
//       <TableCell sx={CELL_SX}>{row.name}</TableCell>

//       <TableCell align="center" sx={CELL_SX}>
//         <Chip
//           label={cfg.label}
//           sx={{
//             height: 24,
//             px: 1.5,
//             fontSize: 12,
//             bgcolor: cfg.bg,
//             color: cfg.color,
//           }}
//         />
//       </TableCell>
//     </TableRow>
//   );
// }
// Not used directly now, but kept for consistency
function TrackEmployeeRow() {
  return null;
}

export default TrackEmployeeRow;
