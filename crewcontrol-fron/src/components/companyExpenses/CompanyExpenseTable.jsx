import UniversalTable from "../table/UniversalTable";
import CompanyExpenseRow from "./CompanyExpenseRow";
import { COMPANY_EXPENSE_COLUMNS } from "./companyExpenseColumns";

// Phase 3.7: see PassportTable.jsx for why this is hoisted.
const SEARCH_KEYS = ["name"];

function CompanyExpenseTable({ rows, selectedMonth, onMonthChange, onEdit, onDelete }) {
  return (
    <UniversalTable
      columns={COMPANY_EXPENSE_COLUMNS}
      rows={rows}
      renderRow={(row, index, rowOffset) => (
        <CompanyExpenseRow
          key={row.id}
          row={row}
          slNo={rowOffset + index + 1}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      )}
      rowsPerPage={10}
      searchKeys={SEARCH_KEYS}
      searchPlaceholder="Search for application id, name..."
      enablePagination
      enableScroll={false}
      monthValue={selectedMonth}
      onMonthChange={onMonthChange}
    />
  );
}

export default CompanyExpenseTable;