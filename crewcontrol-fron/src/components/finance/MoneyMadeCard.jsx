import { Typography, Table, TableBody, TableCell, TableContainer, TableRow } from "@mui/material";
import { useNavigate } from "react-router-dom";
import Card from "../shared/Card/Card";
import TableHeader from "../table/TableHeader";
import RowActionMenu from "../table/RowActionMenu";
import { BODY_CELL_SX, ACTION_CELL_SX, ROW_SX } from "../table/tableUtils";
import { formatAmount } from "../../utils/financeFormat";
import { FINANCE_ROW_HEIGHT } from "./financeLayout";

const NOWRAP_CELL_SX = { ...BODY_CELL_SX, whiteSpace: "nowrap", borderBottom: "1px solid var(--border-card)" };
const ACTION_ROW_SX = { ...ACTION_CELL_SX, borderBottom: "1px solid var(--border-card)" };

const COLUMNS = [
  { key: "employeeId", label: "Employee ID" },
  { key: "name", label: "Employee Name" },
  { key: "investment", label: "Total Investment (AED)" },
  { key: "revenue", label: "Revenue Generated (AED)" },
  { key: "roi", label: "ROI" },
  { key: "actions", label: "Actions", align: "center", width: 72 },
];

// Shares FINANCE_ROW_HEIGHT with InvestmentSummaryCard so the two cards'
// bottoms always land on the same line - only the row list scrolls inside
// it (thin overlay-style scrollbar via TableContainer's own overflow,
// doesn't add to the card's width), so a long employee list can never
// grow the card past that shared height.
function MoneyMadeCard({ rows = [] }) {
  const navigate = useNavigate();

  return (
    <Card sx={{ width: "100%", height: FINANCE_ROW_HEIGHT, px: "16px", py: "20px", display: "flex", flexDirection: "column" }}>
      <Typography fontSize={20} fontWeight={600} color="var(--text-primary)" mb="12px">
        Money made
      </Typography>

      <TableContainer
        sx={{
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          "&::-webkit-scrollbar": { width: 6, height: 6 },
          "&::-webkit-scrollbar-thumb": { backgroundColor: "var(--border-card)", borderRadius: 3 },
          "&::-webkit-scrollbar-track": { backgroundColor: "transparent" },
        }}
      >
        <Table stickyHeader size="small" sx={{ minWidth: 620 }}>
          <TableHeader columns={COLUMNS} cellSx={{ whiteSpace: "nowrap" }} />
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={COLUMNS.length} sx={{ ...BODY_CELL_SX, textAlign: "center", py: "24px" }}>
                  No employee data yet
                </TableCell>
              </TableRow>
            )}

            {rows.map((row) => (
              <TableRow key={row.id} sx={ROW_SX}>
                <TableCell sx={NOWRAP_CELL_SX}>{row.employeeId}</TableCell>
                <TableCell sx={NOWRAP_CELL_SX}>{row.name}</TableCell>
                <TableCell sx={NOWRAP_CELL_SX}>{formatAmount(row.totalInvestment)}</TableCell>
                <TableCell sx={NOWRAP_CELL_SX}>{formatAmount(row.revenueGenerated)}</TableCell>
                <TableCell sx={{ ...NOWRAP_CELL_SX, color: "var(--color-primary)", fontWeight: 600 }}>
                  {row.roi}%
                </TableCell>
                <TableCell sx={ACTION_ROW_SX}>
                  <RowActionMenu onView={() => navigate(`/employees/${row.id}`)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Card>
  );
}

export default MoneyMadeCard;
