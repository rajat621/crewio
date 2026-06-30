import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useNavigate } from "react-router-dom";
import { attendanceApi } from "../api/attendance";
import { employeesApi } from "../api/employees";
import { companiesApi } from "../api/companies";

import EmployeesTabs from "../components/employees/EmployeesTabs";

/* ===== TABLES ===== */
import EmployeesTable from "../components/employees/EmployeesTable";
import AssignedTable from "../components/employees/assigned/AssignedTable";
import AttendanceTable from "../components/employees/attendance/AttendanceTable";
import EmirateIdTable from "../components/employees/emirate-id/EmirateIdTable";
import PassportTable from "../components/employees/passport/PassportTable";
import TrackEmployee from "../components/employees/track/TrackEmployee";

/* ===== KPI ROWS ===== */
import AssignedKpiRow from "../components/employees/assigned/AssignedKpiRow";
import AttendanceKpiRow from "../components/employees/attendance/AttendanceKpiRow";
import EmirateIdKpiRow from "../components/employees/emirate-id/EmirateIdKpiRow";
import PassportKpiRow from "../components/employees/passport/PassportKpiRow";

import NoDataOverlay from "../components/common/NoDataOverlay";

const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const getDocumentStatus = (expiryValue) => {
  if (!expiryValue) return "expired";

  const expiry = new Date(expiryValue);
  if (Number.isNaN(expiry.getTime())) return "expired";

  const now = new Date();
  if (expiry < now) return "expired";

  const daysLeft = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
  return daysLeft <= 60 ? "expiring-soon" : "valid";
};

const getCurrentMonthValue = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

const getMonthRange = (monthValue) => {
  const [yearString, monthString] = String(monthValue || getCurrentMonthValue()).split("-");
  const year = Number(yearString);
  const monthIndex = Number(monthString) - 1;

  const start = new Date(year, monthIndex, 1, 0, 0, 0, 0);
  const end = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);

  return { start, end };
};

const getMonthKey = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

const normalizeAttendanceStatus = (status) => {
  if (status === "leave") return "on-leave";
  if (status === "half-day") return "present";
  return status || "absent";
};

const parseTimeToMinutes = (value) => {
  if (!value || typeof value !== "string") return null;

  const normalized = value.trim().toUpperCase();
  const match = normalized.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3];

  if (hours === 12) {
    hours = 0;
  }

  if (meridiem === "PM") {
    hours += 12;
  }

  return hours * 60 + minutes;
};

const getWorkMinutes = (record) => {
  const checkInMinutes = parseTimeToMinutes(record?.checkIn);
  const checkOutMinutes = parseTimeToMinutes(record?.checkOut);

  if (checkInMinutes == null || checkOutMinutes == null || checkOutMinutes <= checkInMinutes) {
    return 0;
  }

  return checkOutMinutes - checkInMinutes;
};

const formatHours = (minutes) => {
  const totalHours = Number(minutes || 0) / 60;
  if (!Number.isFinite(totalHours) || totalHours <= 0) return "0 hr";

  const rounded = Math.round(totalHours * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} hr`;
};

const buildAttendanceRows = ({ employees, attendanceRecords, selectedMonth }) => {
  const currentMonth = getCurrentMonthValue();

  const recordsByEmployee = attendanceRecords.reduce((map, record) => {
    const employeeId = String(record?.employee || "");
    if (!employeeId) return map;

    if (!map.has(employeeId)) {
      map.set(employeeId, []);
    }

    map.get(employeeId).push(record);
    return map;
  }, new Map());

  return employees.map((employee) => {
    const employeeRecords = [...(recordsByEmployee.get(String(employee.apiId)) || [])].sort(
      (left, right) => new Date(right?.date || 0) - new Date(left?.date || 0)
    );

    const selectedMonthRecords = employeeRecords.filter(
      (record) => getMonthKey(record?.date) === selectedMonth
    );
    const currentMonthRecords = employeeRecords.filter(
      (record) => getMonthKey(record?.date) === currentMonth
    );

    const latestCurrentRecord = currentMonthRecords[0] || employeeRecords[0] || null;
    const currentStatus = normalizeAttendanceStatus(latestCurrentRecord?.status);

    const selectedMonthPresentRecords = selectedMonthRecords.filter(
      (record) => normalizeAttendanceStatus(record?.status) === "present"
    );
    const currentMonthPresentRecords = currentMonthRecords.filter(
      (record) => normalizeAttendanceStatus(record?.status) === "present"
    );
    const currentMonthAbsentRecords = currentMonthRecords.filter(
      (record) => normalizeAttendanceStatus(record?.status) === "absent"
    );
    const currentMonthLeaveRecords = currentMonthRecords.filter(
      (record) => normalizeAttendanceStatus(record?.status) === "on-leave"
    );

    const selectedMonthWorkMinutes = selectedMonthPresentRecords.reduce(
      (sum, record) => sum + getWorkMinutes(record),
      0
    );
    const currentDayWorkMinutes = getWorkMinutes(latestCurrentRecord);

    return {
      ...employee,
      attendanceStatus: currentStatus,
      selectedMonthWorkHours: formatHours(selectedMonthWorkMinutes),
      selectedMonthPresentCount: selectedMonthPresentRecords.length,
      selectedMonthAbsentCount: selectedMonthRecords.filter(
        (record) => normalizeAttendanceStatus(record?.status) === "absent"
      ).length,
      selectedMonthLeaveCount: selectedMonthRecords.filter(
        (record) => normalizeAttendanceStatus(record?.status) === "on-leave"
      ).length,
      currentMonthWorkHours: formatHours(currentDayWorkMinutes),
      currentMonthPresentCount: currentMonthPresentRecords.length,
      currentMonthAbsentCount: currentMonthAbsentRecords.length,
      currentMonthLeaveCount: currentMonthLeaveRecords.length,
      currentCheckIn: latestCurrentRecord?.checkIn || "-",
      currentCheckOut: latestCurrentRecord?.checkOut || "-",
    };
  });
};

  const mapEmployeeToRow = (employee) => {
  const firstName = employee?.firstName || "";
  const lastName = employee?.lastName || "";
  const fullName = `${firstName} ${lastName}`.trim() || employee?.name || "-";

  const companyId =
    employee?.assignedCompanyId?._id ||
    employee?.assignedCompanyId ||
    employee?.company?._id ||
    employee?.company ||
    null;

  const assignedCompany =
    employee?.assignedCompanyId?.name ||
    employee?.company?.name ||
    employee?.companyName ||
    (typeof employee?.assignedCompanyId === "string" ? employee.assignedCompanyId : "-");

    return {
    id: employee?.employeeId || employee?._id || "-",
    apiId: employee?._id || employee?.employeeId || "-",
    name: fullName,
    phone: employee?.mobile || employee?.mobileNumber || "-",
    trade: employee?.trade || employee?.position || "-",
    rate: Number(employee?.ratePerHour || employee?.salary || 0).toFixed(2),
    joined: formatDate(employee?.joiningDate || employee?.joinDate),

    company: assignedCompany || "-",
    companyId,
    project: "-",
    startDate: formatDate(employee?.joiningDate || employee?.joinDate),
    // Prefer backend-provided assignedStatus if available, otherwise fall back
    assignedStatus: employee?.assignedStatus || (companyId ? "on-site" : "site-over"),

    checkIn: "-",
    checkOut: "-",
    totalWorks: 0,
    totalAbsent: 0,
    attendanceStatus: "absent",

    passportNo: employee?.passportNo || "-",
    passportExpiry: formatDate(employee?.passportExpiry),
    passportStatus: getDocumentStatus(employee?.passportExpiry),
    emirateIdNo: employee?.emiratesId || employee?.emirateId || employee?.employeeId || "-",
    emirateIdExpiry: formatDate(employee?.emiratesIdExpiry || employee?.emirateIdExpiry),
    emirateIdStatus: getDocumentStatus(employee?.emiratesIdExpiry || employee?.emirateIdExpiry),
  };
};

const Employees = () => {
  const navigate = useNavigate();
  /* ================= TAB ================= */
  const [activeTab, setActiveTab] = useState("employee-detail");

  /* ================= KPI STATES ================= */
  const [activeAssignedStatus, setActiveAssignedStatus] = useState(null);
  const [activeAttendanceStatus, setActiveAttendanceStatus] = useState(null);
  const [activePassportStatus, setActivePassportStatus] = useState(null);
  const [activeEmirateIdStatus, setActiveEmirateIdStatus] = useState(null);
  const [employeeRows, setEmployeeRows] = useState([]);
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [selectedAttendanceMonth, setSelectedAttendanceMonth] = useState(getCurrentMonthValue());
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState([]);
  const [assignDialogRow, setAssignDialogRow] = useState(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");

  /* ================= RESET KPI ON TAB CHANGE ================= */
  useEffect(() => {
    setActiveAssignedStatus(null);
    setActiveAttendanceStatus(null);
    setActivePassportStatus(null);
    setActiveEmirateIdStatus(null);
  }, [activeTab]);

  const loadEmployees = useCallback(async () => {
    try {
      setLoading(true);
      const response = await employeesApi.getEmployees({ page: 1, limit: 500 });
      const employees = Array.isArray(response?.data?.employees)
        ? response.data.employees
        : Array.isArray(response?.data?.data)
          ? response.data.data
          : [];
      setEmployeeRows(employees.map(mapEmployeeToRow));
    } catch (error) {
      setEmployeeRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAttendanceRecords = useCallback(async (monthValue) => {
    try {
      const selectedRange = getMonthRange(monthValue);
      const currentRange = getMonthRange(getCurrentMonthValue());
      const from = selectedRange.start < currentRange.start ? selectedRange.start : currentRange.start;
      const to = selectedRange.end > currentRange.end ? selectedRange.end : currentRange.end;

      const response = await attendanceApi.getAttendance({
        from: from.toISOString(),
        to: to.toISOString(),
      });

      setAttendanceRecords(Array.isArray(response?.data?.data) ? response.data.data : []);
    } catch (error) {
      setAttendanceRecords([]);
    }
  }, []);

  const loadCompanies = useCallback(async () => {
    try {
      let rows = [];

      try {
        const response = await companiesApi.getClientCompanies({ page: 1, limit: 500 });
        rows = Array.isArray(response?.data?.data)
          ? response.data.data
          : Array.isArray(response?.data?.companies)
            ? response.data.companies
            : [];
      } catch (error) {
        const fallbackResponse = await companiesApi.getCompanies({ page: 1, limit: 500 });
        rows = Array.isArray(fallbackResponse?.data?.data)
          ? fallbackResponse.data.data
          : Array.isArray(fallbackResponse?.data?.companies)
            ? fallbackResponse.data.companies
            : [];
      }

      const mapped = rows
        .filter(
          (company) =>
            (company?.companyRole || "client") === "client" &&
            String(company?.status || "active").toLowerCase() === "active"
        )
        .map((company) => ({
          id: company?._id,
          name: company?.name || "Unnamed company",
        }))
        .filter((company) => company.id);

      setCompanies(mapped);
    } catch (error) {
      setCompanies([]);
    }
  }, []);

  useEffect(() => {
    loadEmployees();
    loadCompanies();
  }, [loadEmployees, loadCompanies]);

  useEffect(() => {
    loadAttendanceRecords(selectedAttendanceMonth);
  }, [loadAttendanceRecords, selectedAttendanceMonth]);

  const attendanceRows = useMemo(
    () =>
      buildAttendanceRows({
        employees: employeeRows,
        attendanceRecords,
        selectedMonth: selectedAttendanceMonth,
      }),
    [employeeRows, attendanceRecords, selectedAttendanceMonth]
  );

  const handleViewAssignedProfile = useCallback(
    (row) => {
      if (row?.id) {
        navigate(`/employees/${row.id}`);
      }
    },
    [navigate]
  );

  const handleUnassignEmployee = useCallback(
    async (row) => {
      if (!row?.apiId) return;
      await employeesApi.unassignEmployee(row.apiId);
      await loadEmployees();
    },
    [loadEmployees]
  );

  const handleViewAttendanceProfile = useCallback(
    (row) => {
      if (row?.id) {
        navigate(`/employees/${row.id}`);
      }
    },
    [navigate]
  );

  const handleOpenAttendanceChat = useCallback(
    (row) => {
      if (!row?.id) return;

      navigate("/chat", {
        state: {
          selectedChat: {
            id: row.id,
            name: row.name,
            avatar: String(row.name || "")
              .split(" ")
              .filter(Boolean)
              .slice(0, 2)
              .map((part) => part[0]?.toUpperCase())
              .join("") || "EM",
            unread: 0,
          },
        },
      });
    },
    [navigate]
  );

  const handleOpenAssignDialog = useCallback((row) => {
    setAssignDialogRow(row || null);
    setSelectedCompanyId("");
  }, []);

  const handleCloseAssignDialog = useCallback(() => {
    setAssignDialogRow(null);
    setSelectedCompanyId("");
  }, []);

  const handleAssignEmployee = useCallback(async () => {
    if (!assignDialogRow?.apiId || !selectedCompanyId) return;
    await employeesApi.assignEmployee(assignDialogRow.apiId, selectedCompanyId);
    handleCloseAssignDialog();
    await loadEmployees();
  }, [assignDialogRow, selectedCompanyId, handleCloseAssignDialog, loadEmployees]);

  const hasEmployees = employeeRows.length > 0;

  if (!loading && !hasEmployees) {
    return (
      <NoDataOverlay
        title="No employees added yet"
        description="Add employees to start assigning them to companies and tracking attendance."
        actionLabel="Add Employees"
        onCancel={() => navigate("/")}
        onAction={() => navigate("/add-employee")}
      />
    );
  }

  return (
    <Box
      sx={{
        px: "40px",
        pt: "24px",
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      {/* ================= HEADER ================= */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <EmployeesTabs value={activeTab} onChange={setActiveTab} />

        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => navigate("/add-employee")}
          sx={{
            height: 32,
            textTransform: "none",
            px: 2,
          }}
        >
          Add Employee
        </Button>
      </Box>

      {/* ================= EMPLOYEE DETAIL ================= */}
      {activeTab === "employee-detail" && (
        <Box
          sx={{
            bgcolor: "var(--bg-surface)",
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 1.5,
            p: "20px",
          }}
        >
          <EmployeesTable rows={employeeRows} />
        </Box>
      )}

      {/* ================= ASSIGNED ================= */}
      {activeTab === "assigned" && (
        <Box
          sx={{
            bgcolor: "var(--bg-surface)",
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 1.5,
            p: "20px",
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          <AssignedKpiRow
            data={employeeRows}
            activeStatus={activeAssignedStatus}
            onChange={setActiveAssignedStatus}
          />

          <AssignedTable
            rows={employeeRows}
            activeStatus={activeAssignedStatus}
            onViewProfile={handleViewAssignedProfile}
            onUnassign={handleUnassignEmployee}
            onAssign={handleOpenAssignDialog}
          />
        </Box>
      )}

      {/* ================= ATTENDANCE ================= */}
      {activeTab === "attendance" && (
        <Box
          sx={{
            bgcolor: "var(--bg-surface)",
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 1.5,
            p: "20px",
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          <AttendanceKpiRow
            data={attendanceRows}
            activeStatus={activeAttendanceStatus}
            onChange={setActiveAttendanceStatus}
          />

          <AttendanceTable
            rows={attendanceRows}
            activeStatus={activeAttendanceStatus}
            selectedMonth={selectedAttendanceMonth}
            onMonthChange={setSelectedAttendanceMonth}
            onViewProfile={handleViewAttendanceProfile}
            onChat={handleOpenAttendanceChat}
          />
        </Box>
      )}

      {/* ================= PASSPORT STATUS ================= */}
      {activeTab === "passport" && (
        <Box
          sx={{
            bgcolor: "var(--bg-surface)",
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 1.5,
            p: "20px",
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          <PassportKpiRow
            data={employeeRows}
            activeStatus={activePassportStatus}
            onChange={setActivePassportStatus}
          />

          <PassportTable rows={employeeRows} activeStatus={activePassportStatus} />
        </Box>
      )}

      {activeTab === "emirate-id" && (
        <Box
          sx={{
            bgcolor: "var(--bg-surface)",
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 1.5,
            p: "20px",
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          <EmirateIdKpiRow
            data={employeeRows}
            activeStatus={activeEmirateIdStatus}
            onChange={setActiveEmirateIdStatus}
          />

          <EmirateIdTable rows={employeeRows} activeStatus={activeEmirateIdStatus} />
        </Box>
      )}

      {/* ================= TRACK EMPLOYEE ================= */}
      {activeTab === "track" && <TrackEmployee rows={employeeRows} />}

      {Boolean(assignDialogRow) && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.20)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "24px",
          }}
          onClick={handleCloseAssignDialog}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "808px",
              minHeight: "500px",
              background: "#fff",
              border: "1px solid var(--border-card)",
              borderRadius: "8px",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div
              style={{
                height: "64px",
                borderBottom: "1px solid var(--border-card)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0 18px",
              }}
            >
              <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 600, color: "var(--text-primary)", letterSpacing: "0.54px", lineHeight: "20px" }}>
                Assign to Company
              </h3>
              <button
                type="button"
                onClick={handleCloseAssignDialog}
                style={{
                  border: "none",
                  background: "transparent",
                  color: "#374151",
                  fontSize: "28px",
                  lineHeight: 1,
                  cursor: "pointer",
                }}
              >
                ×
              </button>
            </div>

            <div style={{ padding: "24px 20px", flex: 1 }}>
              <label style={{ display: "block", fontSize: "14px", color: "var(--text-primary)", marginBottom: "12px", fontWeight: 400 }}>
                Select a company
              </label>
              <select
                className="assign-company-select"
                value={selectedCompanyId}
                onChange={(event) => setSelectedCompanyId(event.target.value)}
                style={{
                  width: "100%",
                  maxWidth: "560px",
                  height: "44px",
                  borderRadius: "8px",
                  padding: "0 40px 0 14px",
                  fontSize: "14px",
                  color: "var(--text-primary)",
                  background: "#fff",
                  fontFamily: "inherit",
                  appearance: "none",
                  WebkitAppearance: "none",
                  MozAppearance: "none",
                  backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 20 20' fill='none'><path d='M5 7L10 12L15 7' stroke='%23141414' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/></svg>")`,
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "right 12px center",
                  backgroundSize: "12px",
                }}
              >
                <option value="">Select company</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </div>

            <div
              style={{
                borderTop: "1px solid var(--border-card)",
                height: "68px",
                display: "flex",
                justifyContent: "flex-end",
                alignItems: "center",
                padding: "0 20px",
              }}
            >
              <button
                type="button"
                onClick={handleAssignEmployee}
                disabled={!selectedCompanyId}
                style={{
                  minWidth: "71px",
                  height: "32px",
                  borderRadius: "8px",
                  border: "none",
                  padding: "0 16px",
                  fontSize: "12px",
                  fontWeight: 500,
                  color: "#fff",
                  background: !selectedCompanyId ? "var(--text-disabled)" : "var(--color-primary)",
                  cursor: !selectedCompanyId ? "not-allowed" : "pointer",
                  fontFamily: "inherit",
                }}
              >
                Assign
              </button>
            </div>
          </div>
        </div>
      )}
    </Box>
  );
};

export default Employees;

