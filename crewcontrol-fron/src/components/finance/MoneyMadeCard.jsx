import { Typography, TableCell, TableRow } from "@mui/material";
import { useNavigate } from "react-router-dom";
import Card from "../shared/Card/Card";
import UniversalTable from "../table/UniversalTable";
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

// Same client-side search + pagination pattern used elsewhere in the app
// (TaxInvoiceTable, CompanyWorkersTable, ExpensesTable, ...): UniversalTable
// owns the search box / prev-next pagination via its shared TableToolbar,
// filtering `rows` in-browser. This data (`rows`, from useFinanceData's
// `moneyMade`) already arrives as a single small, backend-capped array
// (see dashboard.controller.js's getFinanceSummary - employees.slice(0, 20))
// rather than a separately paginated endpoint, so there's nothing to fetch
// page-by-page server-side - unlike Employees.jsx's main table, which needed
// true server pagination specifically to reach records beyond a 200-row cap.
const SEARCH_KEYS = ["employeeId", "name"];
const MONEY_MADE_PAGE_SIZE = 5;

// Shares FINANCE_ROW_HEIGHT with InvestmentSummaryCard so the two cards'
// bottoms always land on the same line - only the row list scrolls inside
// it (thin overlay-style scrollbar via TableContainer's own overflow,
// doesn't add to the card's width), so a long employee list can never
// grow the card past that shared height. Adding the search/pagination
// toolbar above the rows doesn't change the card's width - only how many
// rows are visible before scrolling/paging kicks in.
function MoneyMadeCard({ rows = [] }) {
  const navigate = useNavigate();

  return (
    <Card sx={{ width: "100%", height: FINANCE_ROW_HEIGHT, px: "16px", py: "20px", display: "flex", flexDirection: "column" }}>
      <Typography fontSize={20} fontWeight={600} color="var(--text-primary)" mb="12px">
        Money made
      </Typography>

      {rows.length === 0 ? (
        <Typography sx={{ ...BODY_CELL_SX, textAlign: "center", py: "24px", color: "var(--text-secondary)" }}>
          No employee data yet
        </Typography>
      ) : (
        <UniversalTable
          columns={COLUMNS}
          rows={rows}
          rowsPerPage={MONEY_MADE_PAGE_SIZE}
          searchKeys={SEARCH_KEYS}
          searchPlaceholder="Search employee id, name..."
          enablePagination
          enableScroll
          containerSx={{
            flex: 1,
            minHeight: 0,
            maxHeight: "unset",
            border: "none",
            borderRadius: 0,
            boxShadow: "none",
            display: "flex",
            flexDirection: "column",
            "&::-webkit-scrollbar": { width: 6, height: 6 },
            "&::-webkit-scrollbar-thumb": { backgroundColor: "var(--border-card)", borderRadius: 3 },
            "&::-webkit-scrollbar-track": { backgroundColor: "transparent" },
          }}
          tableSx={{ minWidth: 620 }}
          toolbarRootSx={{ px: 0, py: 0, pb: "10px" }}
          toolbarSearchSx={{ width: 200 }}
          renderRow={(row) => (
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
          )}
        />
      )}
    </Card>
  );
}

export default MoneyMadeCard;
