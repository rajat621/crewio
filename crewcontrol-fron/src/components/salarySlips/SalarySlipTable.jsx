import UniversalTable from "../table/UniversalTable";
import SalarySlipRow from "./SalarySlipRow";
import { SALARY_SLIP_COLUMNS } from "./salarySlipColumns";

// Phase 3.7: see PassportTable.jsx (employees/passport) for why this is
// hoisted.
const SEARCH_KEYS = ["invoiceNo", "employeeName", "trade"];

// Phase 6: `rows` is now the server-paginated current page (see
// SalarySlip.jsx/useSalarySlips.js), not the full 3000+-slip dataset -
// `server` mode makes UniversalTable drive pagination/search through
// page/onPageChange/search/onSearchChange instead of slicing/filtering
// `rows` itself (same "server" contract already used by Employees.jsx's
// Assigned/Passport/EmirateID tabs).
function SalarySlipTable({ rows, onNotify, selectedMonth, onMonthChange, page, onPageChange, total, search, onSearchChange }) {
  return (
    <UniversalTable
      columns={SALARY_SLIP_COLUMNS}
      rows={rows}
      renderRow={(row) => (
        <SalarySlipRow key={row.id} row={row} onNotify={onNotify} />
      )}
      rowsPerPage={10}
      searchKeys={SEARCH_KEYS}
      enablePagination
      enableScroll={false}
      monthValue={selectedMonth}
      onMonthChange={onMonthChange}
      server
      page={page}
      onPageChange={onPageChange}
      total={total}
      search={search}
      onSearchChange={onSearchChange}
    />
  );
}

export default SalarySlipTable;
