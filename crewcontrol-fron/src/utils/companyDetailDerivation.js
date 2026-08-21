import { formatDate, normalizeAttendanceStatus, buildLatestStatusByEmployee } from './companyDerivation'

// Extracted verbatim from CompanyDetail.jsx's loadCompany - the
// present/absent/onLeave stats logic itself is the same shape as
// companyDerivation.js's mapCompanyToCard, but this page's output object
// has a different, page-specific shape (dateRange computed differently,
// includes a `workers` array with per-worker fields CompanyWorkersTable
// needs) - not a drop-in reuse of mapCompanyToCard, so kept as its own
// function rather than forced to fit the other page's shape.
export const computeCompanyDetail = ({ rawCompany, assignedEmployees, attendanceRecords }) => {
  if (!rawCompany) return null;

  const latestStatusByEmployee = buildLatestStatusByEmployee(attendanceRecords);

  const stats = assignedEmployees.reduce(
    (acc, employee) => {
      const employeeId = String(employee?._id || "");
      const latestStatus = normalizeAttendanceStatus(latestStatusByEmployee.get(employeeId)?.status);

      if (latestStatus === "present") acc.present += 1;
      if (latestStatus === "absent") acc.absent += 1;
      if (latestStatus === "on-leave") acc.onLeave += 1;

      return acc;
    },
    { present: 0, absent: 0, onLeave: 0 }
  );

  return {
    id: rawCompany?._id,
    companyRole: rawCompany?.companyRole || 'client',
    name: rawCompany?.name || "Unnamed company",
    dateRange:
      rawCompany?.contractStartDate && rawCompany?.contractEndDate
        ? `${formatDate(rawCompany.contractStartDate)} - ${formatDate(rawCompany.contractEndDate)}`
        : "No contract period",
    status: rawCompany?.status === "inactive" ? "deactivate" : "active",
    totalWorkers: assignedEmployees.length,
    present: stats.present,
    absent: stats.absent,
    onLeave: stats.onLeave,
    phone: rawCompany?.telephoneNumber || rawCompany?.mobileNumber || "-",
    poBox: rawCompany?.poBox || "-",
    fax: rawCompany?.faxNumber || "-",
    address: rawCompany?.address || "-",
    trn: rawCompany?.trn || "-",
    workers: assignedEmployees.map((employee) => ({
      id: employee?._id,
      name: `${employee?.firstName || ""} ${employee?.lastName || ""}`.trim() || "-",
      trade: employee?.trade || "-",
      rate: Number(employee?.ratePerHour || 0).toFixed(2),
      status: "Valid",
    })),
  };
};
