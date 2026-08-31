// Typeable employee picker backed by server-side search (see
// AsyncSearchableSelect.jsx). Searches name, employeeId AND trade in one
// request (see employee.controller.js's getEmployees `search` param) -
// typing "John", "QA-EMP1000", or a trade all work the same way, matching
// anywhere in the field (not just a startsWith prefix), case-insensitively.
//
// Reuse this instead of hand-rolling another employee `<select>`/Autocomplete
// - every page that needs "pick one employee" (Salary Slip, Expenses,
// Invoice generation, Assign Employee) should behave identically.
import { useCallback } from "react";
import { employeesApi } from "../../api/employees";
import { normalizeListResponse } from "../../utils/apiResponseNormalizer";
import AsyncSearchableSelect from "./AsyncSearchableSelect";

const employeeLabel = (emp) => {
  const name = emp.name || `${emp.firstName || ""} ${emp.lastName || ""}`.trim();
  return emp.employeeId ? `${name} (${emp.employeeId})` : name;
};

/**
 * @param {object} props
 * @param {string} props.value
 * @param {(value: string, employee: {value:string,label:string}|null) => void} props.onChange
 * @param {string} [props.valueLabel]
 * @param {string} [props.status] - e.g. "active" to match this app's existing default employee filters
 * @param {string} [props.assignedCompanyId] - pass "unassigned" to only offer employees with no company
 * @param {boolean} [props.disabled]
 * @param {string} [props.placeholder]
 */
function SearchableEmployeeDropdown({
  value,
  onChange,
  valueLabel,
  status = "active",
  assignedCompanyId,
  disabled,
  placeholder,
  style,
}) {
  const fetchOptions = useCallback(
    async (search) => {
      const params = { page: 1, limit: 20 };
      if (status) params.status = status;
      if (assignedCompanyId) params.assignedCompanyId = assignedCompanyId;
      if (search) params.search = search;
      const response = await employeesApi.getEmployees(params);
      const { items } = normalizeListResponse(response);
      return items.map((emp) => ({ value: emp._id || emp.id, label: employeeLabel(emp) }));
    },
    [status, assignedCompanyId]
  );

  return (
    <AsyncSearchableSelect
      value={value}
      onChange={onChange}
      valueLabel={valueLabel}
      fetchOptions={fetchOptions}
      queryKey={["employees", "dropdown", status || "", assignedCompanyId || ""]}
      placeholder={placeholder || "Select or type to search"}
      noOptionsText="No employees found"
      disabled={disabled}
      style={style}
    />
  );
}

export default SearchableEmployeeDropdown;
