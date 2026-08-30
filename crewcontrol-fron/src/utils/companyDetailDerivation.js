import { formatDate } from './companyDerivation'

// Extracted verbatim from CompanyDetail.jsx's loadCompany, then updated to
// consume attendance.controller.js's getAttendanceSummary (?company=id)
// instead of deriving present/absent/on-leave from a raw 120-day
// attendance fetch. That old approach picked each employee's MOST RECENT
// record within 120 days - stale if a worker's last marked day was days
// ago - and pulled the tenant's entire attendance history for that window
// into the browser just to compute three numbers, which was also this
// page's main slow-load cause. attendanceSummary is already today-only and
// pre-aggregated server-side (see useCompanyDetailData.js), so this is now
// a direct passthrough rather than a per-employee reduce.
export const computeCompanyDetail = ({ rawCompany, assignedEmployees, attendanceSummary }) => {
  if (!rawCompany) return null;

  const stats = {
    present: Number(attendanceSummary?.present) || 0,
    absent: Number(attendanceSummary?.absent) || 0,
    onLeave: Number(attendanceSummary?.leave) || 0,
  };

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
