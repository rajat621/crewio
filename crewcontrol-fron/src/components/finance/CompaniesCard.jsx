import { Typography, Tooltip, Table, TableBody, TableCell, TableContainer, TableRow } from "@mui/material";
import Card from "../shared/Card/Card";
import TableHeader from "../table/TableHeader";
import { BODY_CELL_SX } from "../table/tableUtils";
import FinanceStatusPill from "./FinanceStatusPill";
import { formatAmount } from "../../utils/financeFormat";
import { getInitials } from "../../utils/initials";

const ROW_CELL_SX = {
  ...BODY_CELL_SX,
  whiteSpace: "nowrap",
  borderBottom: "1px solid var(--border-card)",
};

const COLUMNS = [
  { key: "name", label: "Company" },
  { key: "workers", label: "Workers" },
  { key: "invoice", label: "Invoice (AED)" },
  { key: "status", label: "Status" },
];

// Company initials avatar - hover shows the full company name via a plain
// MUI Tooltip (same truncate-with-tooltip pattern already used for
// document filenames in taxInvoices/TaxInvoiceRow.jsx). Deliberately NOT a
// navigable link - this Finance-screen representation of a company is a
// visual/data-selection element only, clicking it must not open the real
// Company profile page (that navigation still exists on the Company list
// page itself, untouched).
function CompanyIdentity({ name }) {
  const initials = getInitials(name);

  return (
    <Tooltip title={name} arrow>
      <Typography
        component="span"
        fontSize={13}
        fontWeight={600}
        color="var(--text-primary)"
        sx={{ cursor: "default" }}
      >
        {initials}
      </Typography>
    </Tooltip>
  );
}

// Fixed-height card: the Companies section never grows the page - only the
// TableContainer below scrolls internally (thin overlay-style scrollbar,
// doesn't add to the card's width), and only once there are enough rows to
// exceed this card's own height.
function CompaniesCard({ companies = [] }) {
  return (
    <Card sx={{ width: "100%", height: 476, px: "16px", py: "20px", display: "flex", flexDirection: "column" }}>
      <Typography fontSize={20} fontWeight={600} color="var(--text-primary)" mb="12px">
        Companies
      </Typography>

      <TableContainer
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          overflowX: "hidden",
          "&::-webkit-scrollbar": { width: 6 },
          "&::-webkit-scrollbar-thumb": { backgroundColor: "var(--border-card)", borderRadius: 3 },
          "&::-webkit-scrollbar-track": { backgroundColor: "transparent" },
        }}
      >
        <Table stickyHeader size="small">
          <TableHeader columns={COLUMNS} cellSx={{ whiteSpace: "nowrap" }} />
          <TableBody>
            {companies.length === 0 && (
              <TableRow>
                <TableCell colSpan={COLUMNS.length} sx={{ ...BODY_CELL_SX, textAlign: "center", py: "24px" }}>
                  No companies yet
                </TableCell>
              </TableRow>
            )}

            {companies.map((company) => (
              <TableRow key={company.id}>
                <TableCell sx={ROW_CELL_SX}>
                  <CompanyIdentity name={company.name} />
                </TableCell>
                <TableCell sx={ROW_CELL_SX}>{company.workers}</TableCell>
                <TableCell sx={ROW_CELL_SX}>{formatAmount(company.invoiceAmount)}</TableCell>
                <TableCell sx={ROW_CELL_SX}>
                  <FinanceStatusPill status={company.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Card>
  );
}

export default CompaniesCard;
