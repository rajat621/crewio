import UniversalTable from "../table/UniversalTable";
import TaxInvoiceRow from "./TaxInvoiceRow";
import { TAX_INVOICE_COLUMNS } from "./taxInvoiceColumns";

function TaxInvoiceTable({ rows, onDeleteSuccess, onNotify }) {
  return (
    <UniversalTable
      columns={TAX_INVOICE_COLUMNS}
      rows={rows}
      renderRow={(row) => (
        <TaxInvoiceRow key={row.id} row={row} onDeleteSuccess={onDeleteSuccess} onNotify={onNotify} />
      )}
      rowsPerPage={10}
      searchKeys={["invoiceNo", "company"]}
      enablePagination
      enableScroll={false}
    />
  );
}

export default TaxInvoiceTable;
