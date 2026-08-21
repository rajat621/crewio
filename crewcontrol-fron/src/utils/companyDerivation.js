// Extracted verbatim from Company.jsx during the React Query migration -
// pure functions, zero logic changes.

export const formatDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

export const normalizeAttendanceStatus = (status) => {
  if (status === "leave") return "on-leave";
  if (status === "half-day") return "present";
  return status || "";
};

export const getCompanyIdFromEmployee = (employee) =>
  String(
    employee?.assignedCompanyId?._id ||
      employee?.assignedCompanyId ||
      employee?.company?._id ||
      employee?.company ||
      ""
  );

export const buildLatestStatusByEmployee = (attendanceRecords) => {
  const latestByEmployee = new Map();

  attendanceRecords.forEach((record) => {
    const employeeId = String(record?.employee || "");
    if (!employeeId) return;

    const recordDate = new Date(record?.date || 0).getTime();
    const current = latestByEmployee.get(employeeId);
    const currentDate = new Date(current?.date || 0).getTime();

    if (!current || recordDate > currentDate) {
      latestByEmployee.set(employeeId, record);
    }
  });

  return latestByEmployee;
};

export const mapCompanyToCard = (company, stats = { totalWorkers: 0, present: 0, absent: 0, onLeave: 0 }) => {
  const start = formatDate(company?.contractStartDate);
  const end = formatDate(company?.contractEndDate);

  return {
    id: company?._id,
    name: company?.name || "Unnamed company",
    status: company?.status === "inactive" ? "deactivate" : "active",
    dateRange: start && end ? `${start} - ${end}` : "No contract period",
    totalWorkers: stats.totalWorkers || 0,
    present: stats.present || 0,
    absent: stats.absent || 0,
    onLeave: stats.onLeave || 0,
    phone: company?.telephoneNumber || company?.mobileNumber || "-",
    poBox: company?.poBox || "-",
    fax: company?.faxNumber || "-",
    address: company?.address || "-",
    trn: company?.trn || "-",
    workers: [],
  };
};

// Phase 4: workforceSummary is the server-side aggregation result from
// GET /api/companies/workforce-summary (company.controller.js's
// getCompanyWorkforceSummary) - {[companyId]: {totalWorkers, present,
// absent, onLeave}} for the FULL employee population, not a client-side
// join over a (silently 200-row-capped) employees fetch and a raw 120-day
// attendance fetch. See that endpoint's own comment for why the previous
// browser-side join was both slow and, at this tenant's employee count,
// actually wrong.
export const computeCompanyRows = ({ companies, workforceSummary = {} }) => {
  return companies.map((company) => {
    const companyId = String(company?._id || "");
    return mapCompanyToCard(company, workforceSummary[companyId]);
  });
};
