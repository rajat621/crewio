// Extracted verbatim from SalarySlip.jsx during the React Query migration
// - zero logic changes, including the extensive comments explaining why
// the frozen slipData snapshot takes priority over live employee data
// (historical-record correctness).

export function formatInvoiceDate(slip) {
  const enteredDate = slip?.slipData?.invoiceDate;
  if (enteredDate) {
    const match = String(enteredDate).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (match) {
      const [, day, month, year] = match;
      const parsed = new Date(Number(year), Number(month) - 1, Number(day));
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        });
      }
    }
  }

  if (slip?.createdAt) {
    return new Date(slip.createdAt).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  if (slip?.month || slip?.year) {
    return `${slip.month || ""} ${slip.year || ""}`.trim();
  }

  return "—";
}

export function getEmployeeDisplayName(snapshotEmployee, employee, slip) {
  return (
    snapshotEmployee?.name ||
    employee?.name ||
    [employee?.firstName, employee?.lastName].filter(Boolean).join(" ").trim() ||
    slip?.employeeName ||
    "Employee"
  );
}

export function normalizeSlipRows(items = [], employeesById = new Map(), fallbackEmployee = null) {
  return items.map((slip, index) => {
    const employeeId = String(slip?.employee?._id || slip?.employee || slip?.employeeId || "");
    const employee = employeesById.get(employeeId);
    // A salary slip is a historical record - it must always show what was
    // true AT THE TIME it was generated, never the employee's current live
    // record. The employee doc can be renamed, moved to a different trade,
    // or given a new rate long after a slip was issued; if two slips share
    // an employeeId (this employee has more than one slip) and that
    // employee is later renamed, every one of that employee's OLDER slips
    // would incorrectly start showing the NEW name if we read employee.name
    // directly - overwriting the slip's own history with today's data.
    // slipData.employee/earnings is the frozen snapshot taken at
    // generation time (see buildSlipData in GenerateSalarySlip.jsx), so it
    // takes priority everywhere below. The live `employee` record is only a
    // fallback for older slips generated before that snapshot existed.
    const snapshot = slip?.slipData?.employee || null;
    const snapshotEarnings = slip?.slipData?.earnings || null;
    const advanceAmount = Array.isArray(slip?.deductionsDetails)
      ? slip.deductionsDetails
          .filter((item) => String(item?.type || "").toLowerCase() === "advance")
          .reduce((sum, item) => sum + Number(item?.amount || 0), 0)
      : Number(slip?.advanceAmount || slip?.deductions || 0);

    // rateHr isn't stored directly in the snapshot, but it can be derived
    // exactly from the two snapshot numbers that ARE stored
    // (calculatedSalary = rateHr * totalHoursWorked at generation time) -
    // still more accurate than the employee's current rate, which may have
    // changed since.
    const snapshotRateHr =
      snapshotEarnings?.calculatedSalary && Number(snapshot?.totalHoursWorked)
        ? Number(snapshotEarnings.calculatedSalary) / Number(snapshot.totalHoursWorked)
        : null;

    return {
      id: String(slip?._id || slip?.id || `${employeeId}-${index}`),
      invoiceNo: slip?.invoiceNo || `SLIP-${String(slip?._id || index).slice(-6).toUpperCase()}`,
      employeeId: employeeId || slip?.employeeId || "",
      employeeName: getEmployeeDisplayName(snapshot, employee || fallbackEmployee, slip),
      trade:
        snapshot?.trade ||
        employee?.trade ||
        employee?.position ||
        fallbackEmployee?.trade ||
        fallbackEmployee?.position ||
        slip?.trade ||
        "—",
      invoiceDate: formatInvoiceDate(slip),
      rateHr: Number(snapshotRateHr ?? employee?.ratePerHour ?? employee?.rate ?? slip?.rateHr ?? 0),
      advance: Number(advanceAmount || 0),
      netAmount: Number(slip?.netSalary ?? slip?.netAmount ?? 0),
      slipData: slip?.slipData || null,
      raw: slip,
    };
  });
}
