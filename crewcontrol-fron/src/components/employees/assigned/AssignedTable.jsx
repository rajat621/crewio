import UniversalTable from "../../table/UniversalTable";
import AssignedRow from "./AssignedRow";

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
  activeStatus,
  onViewProfile,
  onAssign,
  onUnassign,
}) {
  return (
    <UniversalTable
      columns={COLUMNS}
      rows={rows}
      rowsPerPage={5}
      kpiFilterKey={activeStatus}
      filterKey="assignedStatus"
      searchKeys={["id", "name", "trade"]}
      renderRow={(row) => (
        <AssignedRow
          key={row.id}
          row={row}
          onViewProfile={onViewProfile}
          onAssign={onAssign}
          onUnassign={onUnassign}
        />
      )}
    />
  );
}

