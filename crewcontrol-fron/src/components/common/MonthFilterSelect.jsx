// components/common/MonthFilterSelect.jsx
//
// The month dropdown originally built for the Employee Attendance page
// (components/employees/attendance/AttendanceTable.jsx) - extracted here so
// Salary Slip and Tax Invoice can reuse the exact same component/behavior
// instead of a copy that could drift from it. Attendance itself has been
// refactored to use this too.
import { useMemo } from "react";
import { MenuItem, Select } from "@mui/material";

export const getMonthOptions = (year = new Date().getFullYear()) => {
  return Array.from({ length: 12 }, (_, index) => {
    const value = `${year}-${String(index + 1).padStart(2, "0")}`;
    const label = new Date(year, index, 1).toLocaleDateString("en-US", {
      month: "long",
    });

    return { value, label };
  });
};

export const getCurrentMonthValue = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

export default function MonthFilterSelect({ value, onChange, disabled = false, size = "small", sx, allowAll = false }) {
  // Attendance (allowAll=false, the default) always needs one real month
  // selected - unchanged from before. Salary Slip / Tax Invoice (allowAll=
  // true) can be genuinely unfiltered ("" = show everything), so an empty
  // value must NOT get silently replaced by the current month here.
  const resolvedValue = allowAll ? (value || "") : (value || getCurrentMonthValue());
  const year = Number(String(resolvedValue || "").split("-")[0]) || new Date().getFullYear();
  // Phase 3.3: getMonthOptions(year) is a pure, deterministic function of
  // year alone - was rebuilding 12 Intl-backed toLocaleDateString() calls
  // on every render regardless of what actually triggered it (this
  // component's parents - AttendanceTable/SalarySlip.jsx/
  // TaxInvoiceList.jsx - all have unrelated search/pagination/socket-
  // refetch state that re-renders them far more often than the user
  // actually changes year). Scoped to [year] only, not resolvedValue/
  // value/disabled/size/sx.
  const monthOptions = useMemo(() => getMonthOptions(year), [year]);

  return (
    <Select
      size={size}
      value={resolvedValue}
      onChange={(event) => onChange?.(event.target.value)}
      disabled={disabled}
      sx={{ height: 32, minWidth: 112, ...sx }}
    >
      {allowAll && <MenuItem value="">All</MenuItem>}
      {monthOptions.map((option) => (
        <MenuItem key={option.value} value={option.value}>
          {option.label}
        </MenuItem>
      ))}
    </Select>
  );
}
