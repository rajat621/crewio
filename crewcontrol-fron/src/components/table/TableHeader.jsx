import { TableHead, TableRow, TableCell } from "@mui/material";
import { HEADER_CELL_SX } from "./tableUtils";

export default function TableHeader({ columns, rowSx, cellSx }) {
  return (
    <TableHead>
      <TableRow sx={{ height: 32, ...rowSx }}>
        {columns.map((col) => (
          <TableCell
            key={col.key}
            align={col.align || "left"}
            sx={{ ...HEADER_CELL_SX, ...cellSx }}
          >
            {col.label}
          </TableCell>
        ))}
      </TableRow>
    </TableHead>
  );
}
