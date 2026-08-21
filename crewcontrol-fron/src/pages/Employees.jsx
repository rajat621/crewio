
// export default Employees;

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Box,
  Button,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useNavigate } from "react-router-dom";
import { useSocket } from "../context/SocketContext";
import { useEmployeesPage } from "../hooks/useEmployeesPage";
import { useEmployeeStats } from "../hooks/useEmployeeStats";
import { useEmployeeAttendancePage, useAttendanceSummary } from "../hooks/useEmployeeAttendancePage";
import { useActiveClientCompanies } from "../hooks/useActiveClientCompanies";
import { useUnassignEmployeeMutation, useReactivateEmployeeMutation, useAssignEmployeeMutation } from "../hooks/mutations/useEmployeeMutations";
import { applySocketEvent } from "../sockets/socketBridge";
import { getCurrentMonthValue } from "../utils/dateRanges";

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

// Stable reference (never scanned - see the KpiRow `data` prop comment
// further down) so passing it doesn't cause UniversalKpiRow to see a "new"
// data prop identity on every render.
const EMPTY_EMPLOYEE_ROWS = [];

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

const getMonthKey = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

const getDayKey = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

const normalizeAttendanceStatus = (status) => {
  if (status === "leave") return "on-leave";
  if (status === "half-day") return "present";
  return status || "absent";
};

// The backend (mobileLifecycle.controller.js getTimeString) stores
// checkIn/checkOut as 24-hour "HH:mm" strings (e.g. "14:05"), never
// 12-hour "hh:mm AM/PM". This formatter is purely for display - it does
// NOT feed into any hours calculation (see formatHours below, which uses
// the backend's own authoritative hoursWorked value instead).
const formatTimeDisplay = (value) => {
  if (!value || typeof value !== "string") return "-";

  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return value;

  let hours = Number(match[1]);
  const minutes = String(match[2]).padStart(2, "0");
  const meridiem = hours >= 12 ? "PM" : "AM";

  hours = hours % 12;
  if (hours === 0) hours = 12;

  return `${String(hours).padStart(2, "0")}:${minutes} ${meridiem}`;
};

// Hours worked must always come from the backend's own hoursWorked field
// (computed server-side from Start Work / Stop Work timestamps, or from
// the employee-selected value on Stop Work - see mobileLifecycle
// controller). Previously this was recomputed here from the raw
// checkIn/checkOut strings using a 12-hour AM/PM parser, which silently
// returned 0 for every real record since the backend sends 24-hour times -
// that's why "Hours Worked" / "Total Work Hour" always showed "0 hr".
const getRecordHours = (record) => Number(record?.hoursWorked || 0);

const formatHours = (hours) => {
  const totalHours = Number(hours || 0);
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

    // "Present Today" / check-in / check-out must reflect exactly today's
    // record - previously this used the most recent record in the whole
    // month, which showed stale status/times from days ago whenever an
    // employee hadn't done anything yet today.
    const todayKey = getDayKey(new Date());
    const todayRecord = employeeRecords.find((record) => getDayKey(record?.date) === todayKey) || null;
    const currentStatus = todayRecord ? normalizeAttendanceStatus(todayRecord.status) : "absent";

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

    const selectedMonthWorkHoursTotal = selectedMonthPresentRecords.reduce(
      (sum, record) => sum + getRecordHours(record),
      0
    );
    const currentDayWorkHours = getRecordHours(todayRecord);

    return {
      ...employee,
      attendanceStatus: currentStatus,
      selectedMonthWorkHours: formatHours(selectedMonthWorkHoursTotal),
      selectedMonthPresentCount: selectedMonthPresentRecords.length,
      selectedMonthAbsentCount: selectedMonthRecords.filter(
        (record) => normalizeAttendanceStatus(record?.status) === "absent"
      ).length,
      selectedMonthLeaveCount: selectedMonthRecords.filter(
        (record) => normalizeAttendanceStatus(record?.status) === "on-leave"
      ).length,
      currentMonthWorkHours: formatHours(currentDayWorkHours),
      currentMonthPresentCount: currentMonthPresentRecords.length,
      currentMonthAbsentCount: currentMonthAbsentRecords.length,
      currentMonthLeaveCount: currentMonthLeaveRecords.length,
      currentCheckIn: formatTimeDisplay(todayRecord?.checkIn),
      currentCheckOut: formatTimeDisplay(todayRecord?.checkOut),
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
  /* ===== Employee Detail tab: true server-side pagination + search =====
     Fetches exactly the page/search the user asked for from the backend,
     so records beyond the old 200-row cap are actually reachable via
     paging or search. */
  const [mainTablePage, setMainTablePage] = useState(1);
  const [mainTableSearchInput, setMainTableSearchInput] = useState("");
  const [mainTableSearch, setMainTableSearch] = useState("");
  const MAIN_TABLE_PAGE_SIZE = 10;

  useEffect(() => {
    const handle = setTimeout(() => {
      setMainTableSearch(mainTableSearchInput);
      setMainTablePage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [mainTableSearchInput]);

  const { data: mainTableData } = useEmployeesPage(mainTablePage, MAIN_TABLE_PAGE_SIZE, mainTableSearch);
  const mainTableRows = useMemo(
    () => (mainTableData?.items || []).map(mapEmployeeToRow),
    [mainTableData]
  );

  // Full-tenant-population counts (total/assignedStatus/passportStatus/
  // emirateIdStatus) - every KPI row below reads from this, never from
  // mainTableRows/any other page-sized array. Also backs the page-level
  // loading/empty-state check below (was previously a separate, redundant
  // GET /api/employees?limit=500 fired unconditionally on every page load
  // just to check "is there at least one employee" and feed a `data` KPI
  // fallback prop that's never actually read once `stats` resolves - see
  // UniversalKpiRow.jsx, which only ever scans `data` when `counts` is
  // null, and `counts` is always provided here).
  const { data: employeeStats, isLoading: statsLoading } = useEmployeeStats();

  // Assigned/Passport/EmirateID tabs: same server-pagination pattern as
  // the Employee Detail tab above, plus a server-side status filter tied
  // to whichever KPI card is active - clicking "Unassigned" filters the
  // table via assignedStatus=on-hold server-side (matching the KPI's own
  // full-population number), not a client-side .filter() over one
  // already-loaded page.
  const TAB_PAGE_SIZE = 10;
  const [assignedTablePage, setAssignedTablePage] = useState(1);
  const [assignedTableSearch, setAssignedTableSearch] = useState("");
  const { data: assignedTableData } = useEmployeesPage(assignedTablePage, TAB_PAGE_SIZE, assignedTableSearch, { assignedStatus: activeAssignedStatus }, { enabled: activeTab === "assigned" });
  const assignedTableRows = useMemo(() => (assignedTableData?.items || []).map(mapEmployeeToRow), [assignedTableData]);

  const [passportTablePage, setPassportTablePage] = useState(1);
  const [passportTableSearch, setPassportTableSearch] = useState("");
  const { data: passportTableData } = useEmployeesPage(passportTablePage, TAB_PAGE_SIZE, passportTableSearch, { passportStatus: activePassportStatus }, { enabled: activeTab === "passport" });
  const passportTableRows = useMemo(() => (passportTableData?.items || []).map(mapEmployeeToRow), [passportTableData]);

  const [emirateIdTablePage, setEmirateIdTablePage] = useState(1);
  const [emirateIdTableSearch, setEmirateIdTableSearch] = useState("");
  const { data: emirateIdTableData } = useEmployeesPage(emirateIdTablePage, TAB_PAGE_SIZE, emirateIdTableSearch, { emirateIdStatus: activeEmirateIdStatus }, { enabled: activeTab === "emirate-id" });
  const emirateIdTableRows = useMemo(() => (emirateIdTableData?.items || []).map(mapEmployeeToRow), [emirateIdTableData]);

  // Changing which KPI card is active re-scopes the server query - always
  // land back on page 1 of the new (differently-sized) filtered result.
  // React's own recommended "adjust state when a prop changes" pattern
  // (a render-time comparison against a tracked previous value) rather
  // than an effect that calls setState synchronously - avoids the extra
  // render-commit-effect-render cycle an effect-based reset would cause.
  const [prevAssignedStatus, setPrevAssignedStatus] = useState(activeAssignedStatus);
  if (prevAssignedStatus !== activeAssignedStatus) {
    setPrevAssignedStatus(activeAssignedStatus);
    setAssignedTablePage(1);
  }
  const [prevPassportStatus, setPrevPassportStatus] = useState(activePassportStatus);
  if (prevPassportStatus !== activePassportStatus) {
    setPrevPassportStatus(activePassportStatus);
    setPassportTablePage(1);
  }
  const [prevEmirateIdStatus, setPrevEmirateIdStatus] = useState(activeEmirateIdStatus);
  if (prevEmirateIdStatus !== activeEmirateIdStatus) {
    setPrevEmirateIdStatus(activeEmirateIdStatus);
    setEmirateIdTablePage(1);
  }

  const [selectedAttendanceMonth, setSelectedAttendanceMonth] = useState(getCurrentMonthValue());

  // Attendance tab: server-paginated employees already joined with their
  // attendance (see employee.controller.js's getEmployeeAttendancePage) -
  // was previously built by joining ALL of the selected month's
  // attendance against a single capped-at-200 employees fetch entirely in
  // the browser (buildAttendanceRows), so any employee outside that page
  // never appeared here regardless of their real attendance.
  const ATTENDANCE_PAGE_SIZE = 5;
  const [attendanceTablePage, setAttendanceTablePage] = useState(1);
  const [attendanceTableSearchInput, setAttendanceTableSearchInput] = useState("");
  const [attendanceTableSearch, setAttendanceTableSearch] = useState("");
  useEffect(() => {
    const handle = setTimeout(() => setAttendanceTableSearch(attendanceTableSearchInput), 300);
    return () => clearTimeout(handle);
  }, [attendanceTableSearchInput]);
  const attendanceResetKey = `${activeAttendanceStatus || ""}:${selectedAttendanceMonth}:${attendanceTableSearch}`;
  const [prevAttendanceResetKey, setPrevAttendanceResetKey] = useState(attendanceResetKey);
  if (prevAttendanceResetKey !== attendanceResetKey) {
    setPrevAttendanceResetKey(attendanceResetKey);
    setAttendanceTablePage(1);
  }
  const { data: attendancePageData } = useEmployeeAttendancePage(
    attendanceTablePage, ATTENDANCE_PAGE_SIZE, attendanceTableSearch, selectedAttendanceMonth, activeAttendanceStatus,
    activeTab === "attendance"
  );
  const attendanceRows = attendancePageData?.items || [];

  const { data: attendanceSummary } = useAttendanceSummary(activeTab === "attendance");

  // Track Employee tab: same paginated/joined data source, unfiltered by
  // status, larger page size (this tab is a searchable map-selector list,
  // not a KPI-driven table) - still server-side search, so an employee
  // beyond the old 200-row cap is reachable here too.
  const TRACK_PAGE_SIZE = 50;
  const [trackTablePage, setTrackTablePage] = useState(1);
  const [trackTableSearchInput, setTrackTableSearchInput] = useState("");
  const [trackTableSearch, setTrackTableSearch] = useState("");
  useEffect(() => {
    const handle = setTimeout(() => { setTrackTableSearch(trackTableSearchInput); setTrackTablePage(1); }, 300);
    return () => clearTimeout(handle);
  }, [trackTableSearchInput]);
  const { data: trackPageData } = useEmployeeAttendancePage(trackTablePage, TRACK_PAGE_SIZE, trackTableSearch, undefined, undefined, activeTab === "track");
  const trackRows = trackPageData?.items || [];

  const { data: companies = [] } = useActiveClientCompanies();
  const [assignDialogRow, setAssignDialogRow] = useState(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");

  /* ================= RESET KPI ON TAB CHANGE ================= */
  useEffect(() => {
    setActiveAssignedStatus(null);
    setActiveAttendanceStatus(null);
    setActivePassportStatus(null);
    setActiveEmirateIdStatus(null);
  }, [activeTab]);

  /* ================= LIVE ATTENDANCE/KPI UPDATES ================= */
  // Every lifecycle action the mobile app performs (check-in, start/stop
  // work, leave start/end, site finished, assignment) is broadcast over
  // Socket.IO (see backend/src/services/lifecycle.service.js). Rather than
  // requiring a manual page refresh, just refetch the same data these tabs
  // already load whenever one of these events comes in - the KPI counts,
  // check-in/checkout times, and "present today" status all fall out of
  // the existing buildAttendanceRows computation automatically.
  const { socket } = useSocket();
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!socket) return;

    // Every attendance/employee lifecycle event now routes through the
    // shared socket bridge (sockets/socketBridge.js) instead of two
    // separately-maintained handlers with overlapping event lists
    // (employee:site_finished was previously registered in both
    // attendanceEvents and employeeEvents - the bridge's mapping already
    // covers both concerns for that event in one place, so no
    // duplication is needed here anymore).
    //
    // NOTE: this replaces a previous recency-guard optimization that
    // skipped re-invalidating the employees list if a just-completed
    // local mutation had already updated it. Deliberately not preserved -
    // invalidateQueries firing twice in quick succession has no visible
    // UX effect (React Query keeps showing cached data through a
    // background refetch), so this trades a possible harmless extra
    // background request for clean, uniform bridge integration.
    const handledEvents = [
      "employee:checked_in",
      "employee:started_work",
      "employee:stopped_work",
      "employee:leave_started",
      "employee:leave_ended",
      "employee:assigned",
      "employee:unassigned",
      "employee:site_finished",
    ];
    const handlers = handledEvents.map((event) => {
      const handler = (payload) => applySocketEvent(queryClient, event, payload);
      socket.on(event, handler);
      return { event, handler };
    });

    return () => {
      handlers.forEach(({ event, handler }) => socket.off(event, handler));
    };
  }, [socket, queryClient]);

  const handleViewAssignedProfile = useCallback(
    (row) => {
      if (row?.id) {
        navigate(`/employees/${row.id}`);
      }
    },
    [navigate]
  );

  const unassignMutation = useUnassignEmployeeMutation();
  const reactivateMutation = useReactivateEmployeeMutation();
  const assignMutation = useAssignEmployeeMutation();

  const handleUnassignEmployee = useCallback(
    (row) => {
      if (!row?.apiId) return;
      unassignMutation.mutate(row.apiId);
    },
    [unassignMutation]
  );

  const handleReactivateEmployee = useCallback(
    (row) => {
      if (!row?.apiId) return;
      reactivateMutation.mutate(row.apiId);
    },
    [reactivateMutation]
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

  const handleAssignEmployee = useCallback(() => {
    if (!assignDialogRow?.apiId || !selectedCompanyId) return;
    assignMutation.mutate(
      { employeeId: assignDialogRow.apiId, companyId: selectedCompanyId },
      { onSuccess: handleCloseAssignDialog }
    );
  }, [assignDialogRow, selectedCompanyId, handleCloseAssignDialog, assignMutation]);

  const hasEmployees = (employeeStats?.total || 0) > 0;

  if (!statsLoading && !hasEmployees) {
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
          <EmployeesTable
            rows={mainTableRows}
            server
            page={mainTablePage}
            onPageChange={setMainTablePage}
            total={mainTableData?.total ?? 0}
            search={mainTableSearchInput}
            onSearchChange={setMainTableSearchInput}
          />
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
            data={EMPTY_EMPLOYEE_ROWS}
            stats={employeeStats}
            activeStatus={activeAssignedStatus}
            onChange={setActiveAssignedStatus}
          />

          <AssignedTable
            rows={assignedTableRows}
            server
            page={assignedTablePage}
            onPageChange={setAssignedTablePage}
            total={assignedTableData?.total ?? 0}
            search={assignedTableSearch}
            onSearchChange={setAssignedTableSearch}
            onViewProfile={handleViewAssignedProfile}
            onUnassign={handleUnassignEmployee}
            onAssign={handleOpenAssignDialog}
            onReactivate={handleReactivateEmployee}
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
            stats={attendanceSummary}
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
            page={attendanceTablePage}
            onPageChange={setAttendanceTablePage}
            total={attendancePageData?.meta?.total ?? 0}
            rowsPerPage={ATTENDANCE_PAGE_SIZE}
            search={attendanceTableSearchInput}
            onSearchChange={setAttendanceTableSearchInput}
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
            data={EMPTY_EMPLOYEE_ROWS}
            stats={employeeStats}
            activeStatus={activePassportStatus}
            onChange={setActivePassportStatus}
          />

          <PassportTable
            rows={passportTableRows}
            server
            page={passportTablePage}
            onPageChange={setPassportTablePage}
            total={passportTableData?.total ?? 0}
            search={passportTableSearch}
            onSearchChange={setPassportTableSearch}
          />
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
            data={EMPTY_EMPLOYEE_ROWS}
            stats={employeeStats}
            activeStatus={activeEmirateIdStatus}
            onChange={setActiveEmirateIdStatus}
          />

          <EmirateIdTable
            rows={emirateIdTableRows}
            server
            page={emirateIdTablePage}
            onPageChange={setEmirateIdTablePage}
            total={emirateIdTableData?.total ?? 0}
            search={emirateIdTableSearch}
            onSearchChange={setEmirateIdTableSearch}
          />
        </Box>
      )}

      {/* ================= TRACK EMPLOYEE ================= */}
      {/* Uses attendanceRows (not employeeRows) so the Status column
          reflects each employee's actual today's attendance - employeeRows
          hardcodes attendanceStatus: "absent" as a static default (see
          mapEmployeeToRow) since it's built straight from the employee
          list with no attendance join, which is why this tab previously
          showed every employee as "Absent" regardless of real status. */}
      {activeTab === "track" && (
        <TrackEmployee
          rows={trackRows}
          search={trackTableSearchInput}
          onSearchChange={setTrackTableSearchInput}
          page={trackTablePage}
          onPageChange={setTrackTablePage}
          total={trackPageData?.meta?.total ?? 0}
          pageSize={TRACK_PAGE_SIZE}
        />
      )}

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