import UniversalTable from "../../table/UniversalTable";
import EmirateIdRow from "./EmirateIdRow";

// Phase 3.7: see PassportTable.jsx for why this is hoisted.
const SEARCH_KEYS = ["id", "name", "emirateIdNo"];

const COLUMNS = [
  { key: "id", label: "Employee ID" },
  { key: "name", label: "Employee Name" },
  { key: "emirateIdNo", label: "Emirate ID" },
  { key: "emirateIdExpiry", label: "Expiry Date" },
  { key: "emirateIdStatus", label: "Status", align: "center" },
  { key: "action", label: "Action", align: "center" },
];

function EmirateIdTable({ rows = [], server = false, page, onPageChange, total, search, onSearchChange }) {
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
      renderRow={(row) => <EmirateIdRow key={row.id} row={row} />}
    />
  );
}

export default EmirateIdTable;
