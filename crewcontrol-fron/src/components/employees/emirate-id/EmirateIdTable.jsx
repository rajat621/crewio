<<<<<<< HEAD
﻿import UniversalTable from "../../table/UniversalTable";
=======
import UniversalTable from "../../table/UniversalTable";
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
import EmirateIdRow from "./EmirateIdRow";

const COLUMNS = [
  { key: "id", label: "Employee ID" },
  { key: "name", label: "Employee Name" },
  { key: "emirateIdNo", label: "Emirate ID" },
  { key: "emirateIdExpiry", label: "Expiry Date" },
  { key: "emirateIdStatus", label: "Status", align: "center" },
  { key: "action", label: "Action", align: "center" },
];

function EmirateIdTable({ rows = [], activeStatus }) {
  return (
    <UniversalTable
      columns={COLUMNS}
      rows={rows}
      rowsPerPage={5}
      kpiFilterKey={activeStatus}
      filterKey="emirateIdStatus"
      searchKeys={["id", "name", "emirateIdNo"]}
      renderRow={(row) => <EmirateIdRow key={row.id} row={row} />}
    />
  );
}

<<<<<<< HEAD
export default EmirateIdTable;
=======
export default EmirateIdTable;
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
