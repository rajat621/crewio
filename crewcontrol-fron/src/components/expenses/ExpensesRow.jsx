import { TableRow, TableCell, Button } from "@mui/material";

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
      <TableCell sx={{ fontSize: 14 }}>{serialNo}</TableCell>
      <TableCell sx={{ fontSize: 14 }}>{row.employeeName}</TableCell>
      <TableCell sx={{ fontSize: 14 }}>{row.trade}</TableCell>
      <TableCell sx={{ fontSize: 14 }}>{row.totalAdvance.toFixed(2)}</TableCell>
      <TableCell sx={{ fontSize: 14 }}>{row.deduction.toFixed(2)}</TableCell>
      <TableCell sx={{ fontSize: 14 }}>{row.remainingAmount.toFixed(2)}</TableCell>
      <TableCell align="right">
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