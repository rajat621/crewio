import UniversalTable from "../../table/UniversalTable";
import AssignedRow from "./AssignedRow";

// Phase 3.7: see PassportTable.jsx for why this is hoisted.
const SEARCH_KEYS = ["id", "name", "trade"];

const COLUMNS = [
  { key: "id", label: "Employee ID" },
  { key: "name", label: "Employee Name" },
  { key: "company", label: "Assigned Company" },
  { key: "trade", label: "Trade" },
  { key: "startDate", label: "Start Date" },
  { key: "rate", label: "Rate" },
  { key: "assignedStatus", label: "Status", align: "center" },
  { key: "action", label: "Action", align: "center" },
];

export default function AssignedTable({
  rows = [],
  onViewProfile,
  onAssign,
  onUnassign,
  onReactivate,
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
      server={server}
      page={page}
      onPageChange={onPageChange}
      total={total}
      search={search}
      onSearchChange={onSearchChange}
      renderRow={(row) => (
        <AssignedRow
          key={row.id}
          row={row}
          onViewProfile={onViewProfile}
          onAssign={onAssign}
          onUnassign={onUnassign}
          onReactivate={onReactivate}
        />
      )}
    />
  );
}

