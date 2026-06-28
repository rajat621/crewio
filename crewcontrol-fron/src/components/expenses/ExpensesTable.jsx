import UniversalTable from "../table/UniversalTable";
import ExpensesRow from "./ExpensesRow";
import { EXPENSE_COLUMNS } from "./expensesColumns";

function ExpensesTable({ rows, onView, selectedId }) {
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
      rowsPerPage={10}
      searchKeys={["employeeName", "trade"]}
      enablePagination
      enableScroll={false}
    />
  );
}

export default ExpensesTable;