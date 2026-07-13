import UniversalTable from "../../table/UniversalTable";
import PassportRow from "./PassportRow";

const COLUMNS = [
  { key: "id", label: "Employee ID" },
  { key: "name", label: "Employee Name" },
  { key: "passportNo", label: "Passport No" },
  { key: "passportExpiry", label: "Expiry Date" },
  { key: "passportStatus", label: "Status", align: "center" },
  { key: "action", label: "Action", align: "center" },
];

function PassportTable({ rows = [], activeStatus }) {
  return (
    <UniversalTable
      columns={COLUMNS}
      rows={rows}
      rowsPerPage={5}
      kpiFilterKey={activeStatus}
      filterKey="passportStatus"
      searchKeys={["id", "name", "passportNo"]}
      renderRow={(row) => (
        <PassportRow key={row.id} row={row} />
      )}
    />
  );
}

export default PassportTable;
