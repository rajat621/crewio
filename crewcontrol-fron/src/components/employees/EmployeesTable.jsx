import UniversalTable from "../table/UniversalTable";
import EmployeeRow from "./EmployeeRow";

const COLUMNS = [
  { key: "id", label: "Employee ID" },
  { key: "name", label: "Employee Name" },
  { key: "phone", label: "Phone No." },
  { key: "trade", label: "Trade" },
  { key: "rate", label: "Rate" },
  { key: "joined", label: "Joined On" },
  { key: "action", label: "Action", align: "center" },
];

export default function EmployeesTable({ rows }) {
  return (
    <UniversalTable
      columns={COLUMNS}
      rows={rows}
      rowsPerPage={10}
      searchKeys={["id", "name", "trade"]}
      renderRow={(row) => <EmployeeRow key={row.id} row={row} />}
    />
  );
}

