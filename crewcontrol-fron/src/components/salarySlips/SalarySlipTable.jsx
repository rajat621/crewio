import UniversalTable from "../table/UniversalTable";
import SalarySlipRow from "./SalarySlipRow";
import { SALARY_SLIP_COLUMNS } from "./salarySlipColumns";

function SalarySlipTable({ rows, onNotify }) {
  return (
    <UniversalTable
      columns={SALARY_SLIP_COLUMNS}
      rows={rows}
      renderRow={(row) => (
        <SalarySlipRow key={row.id} row={row} onNotify={onNotify} />
      )}
      rowsPerPage={10}
      searchKeys={["invoiceNo", "employeeName", "trade"]}
      enablePagination
      enableScroll={false}
    />
  );
}

export default SalarySlipTable;
