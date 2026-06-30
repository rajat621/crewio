import { TableRow, TableCell, Button } from "@mui/material";
import { BODY_CELL_SX, ACTION_CELL_SX } from "../table/tableUtils";
import { EXPENSE_COLUMNS } from "./expensesColumns";

const colWidth = (key) => EXPENSE_COLUMNS.find((c) => c.key === key)?.width;

export default function ExpensesRow({ row, onView, selectedId, index }) {
  const isSelected = selectedId === row.id;
  // Use 1-based index for the serial number; fall back gracefully.
  const serialNo = typeof index === "number" ? index + 1 : row.id;

  return (
    <TableRow
      hover
      selected={isSelected}
      sx={{
        cursor: "pointer",
        bgcolor: isSelected ? "rgba(44,95,234,0.04) !important" : undefined,
      }}
    >
      <TableCell sx={{ ...BODY_CELL_SX, width: colWidth("id") }}>{serialNo}</TableCell>
      <TableCell sx={{ ...BODY_CELL_SX, width: colWidth("employeeName") }}>{row.employeeName}</TableCell>
      <TableCell sx={{ ...BODY_CELL_SX, width: colWidth("trade") }}>{row.trade}</TableCell>
      <TableCell sx={{ ...BODY_CELL_SX, width: colWidth("totalAdvance") }}>{row.totalAdvance.toFixed(2)}</TableCell>
      <TableCell sx={{ ...BODY_CELL_SX, width: colWidth("deduction") }}>{row.deduction.toFixed(2)}</TableCell>
      <TableCell sx={{ ...BODY_CELL_SX, width: colWidth("remainingAmount") }}>{row.remainingAmount.toFixed(2)}</TableCell>
      <TableCell align="right" sx={{ ...ACTION_CELL_SX, width: colWidth("actions") }}>
        <Button
          variant="text"
          onClick={() => onView(row)}
          sx={{
            textTransform: "none",
            fontSize: 14,
            fontWeight: isSelected ? 700 : 500,
            color: "var(--color-primary)",
            minWidth: "unset",
            padding: "2px 0",
          }}
        >
          View
        </Button>
      </TableCell>
    </TableRow>
  );
}