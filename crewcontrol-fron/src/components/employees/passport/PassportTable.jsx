import UniversalTable from "../../table/UniversalTable";
import PassportRow from "./PassportRow";

// Phase 3.7: hoisted from an inline array literal - was recreated every
// render of this wrapper, defeating UniversalTable's filteredRows
// useMemo (which depends on searchKeys) whenever this component
// re-rendered for any reason, even when rows/search hadn't changed.
const SEARCH_KEYS = ["id", "name", "passportNo"];

const COLUMNS = [
  { key: "id", label: "Employee ID" },
  { key: "name", label: "Employee Name" },
  { key: "passportNo", label: "Passport No" },
  { key: "passportExpiry", label: "Expiry Date" },
  { key: "passportStatus", label: "Status", align: "center" },
  { key: "action", label: "Action", align: "center" },
];

function PassportTable({ rows = [], server = false, page, onPageChange, total, search, onSearchChange }) {
  return (
    <UniversalTable
      columns={COLUMNS}
      rows={rows}
      rowsPerPage={10}
      searchKeys={SEARCH_KEYS}
      server={server}
      page={page}
      onPageChange={onPageChange}
      total={total}
      search={search}
      onSearchChange={onSearchChange}
      renderRow={(row) => (
        <PassportRow key={row.id} row={row} />
      )}
    />
  );
}

export default PassportTable;
