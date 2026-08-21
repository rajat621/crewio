import UniversalTable from "../table/UniversalTable";
import ExpensesRow from "./ExpensesRow";
import { EXPENSE_COLUMNS } from "./expensesColumns";

// Phase 3.7: see PassportTable.jsx for why this is hoisted.
const SEARCH_KEYS = ["employeeName", "trade"];

function ExpensesTable({ rows, onView, selectedId, server, page, onPageChange, total, search, onSearchChange, rowsPerPage = 10 }) {
  return (
    <UniversalTable
      columns={EXPENSE_COLUMNS}
      rows={rows}
      renderRow={(row, index) => (
        <ExpensesRow
          key={row.id}
          row={row}
          // If UniversalTable doesn't pass index, fall back to a position lookup.
          index={typeof index === "number" ? index : rows.indexOf(row)}
          onView={onView}
          selectedId={selectedId}
        />
      )}
      rowsPerPage={rowsPerPage}
      searchKeys={SEARCH_KEYS}
      enablePagination
      enableScroll={false}
      server={server}
      page={page}
      onPageChange={onPageChange}
      total={total}
      search={search}
      onSearchChange={onSearchChange}
    />
  );
}

export default ExpensesTable;