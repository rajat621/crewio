import UniversalTable from "../table/UniversalTable";
import TaxInvoiceRow from "./TaxInvoiceRow";
import { TAX_INVOICE_COLUMNS } from "./taxInvoiceColumns";

// Phase 3.7: see PassportTable.jsx (employees/passport) for why this is
// hoisted.
const SEARCH_KEYS = ["invoiceNo", "company"];

function TaxInvoiceTable({ rows, onDeleteSuccess, onNotify, selectedMonth, onMonthChange }) {
  return (
    <UniversalTable
      columns={TAX_INVOICE_COLUMNS}
      rows={rows}
      renderRow={(row) => (
        <TaxInvoiceRow key={row.id} row={row} onDeleteSuccess={onDeleteSuccess} onNotify={onNotify} />
      )}
      rowsPerPage={10}
      searchKeys={SEARCH_KEYS}
      enablePagination
      enableScroll={false}
      monthValue={selectedMonth}
      onMonthChange={onMonthChange}
    />
  );
}

export default TaxInvoiceTable;
