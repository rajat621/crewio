import UniversalTable from "../table/UniversalTable";
import EmployeeRow from "./EmployeeRow";

// Phase 3.7: see PassportTable.jsx for why this is hoisted.
const SEARCH_KEYS = ["id", "name", "trade"];

const COLUMNS = [
  { key: "id", label: "Employee ID" },
  { key: "name", label: "Employee Name" },
  { key: "phone", label: "Phone No." },
  { key: "trade", label: "Trade" },
  { key: "rate", label: "Rate" },
  { key: "joined", label: "Joined On" },
  { key: "action", label: "Action", align: "center" },
];

export default function EmployeesTable({
  rows,
  server = false,
  page,
  onPageChange,
  total,
  search,
  onSearchChange,
}) {
  return (
    <UniversalTable
      columns={COLUMNS}
      rows={rows}
      rowsPerPage={10}
      searchKeys={SEARCH_KEYS}
      renderRow={(row) => <EmployeeRow key={row.id} row={row} />}
      server={server}
      page={page}
      onPageChange={onPageChange}
      total={total}
      search={search}
      onSearchChange={onSearchChange}
    />
  );
}

