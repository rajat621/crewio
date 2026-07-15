// src/pages/Home.jsx
import { Box, Typography, Grid, Button, IconButton } from "@mui/material";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { companiesApi } from "../api/companies";
import { employeesApi } from "../api/employees";
import { attendanceApi } from "../api/attendance";
import { invoicesApi } from "../api/invoices";
import { salarySlipsApi } from "../api/salarySlips";
import { isCompanyProfileComplete } from "../utils/companyProfileStatus";
import KpiGrid from "../components/kpi/KPIGrid";
import AttendanceCard from "../components/attendance/AttendanceCard";
import AlertBox from "../components/alerts/AlertBox";

const DAY_MS = 1000 * 60 * 60 * 24;

const parseDataArray = (response) => {
  if (Array.isArray(response?.data?.data)) return response.data.data;
  if (Array.isArray(response?.data?.companies)) return response.data.companies;
  if (Array.isArray(response?.data)) return response.data;
  return [];
};

const getStartOfDay = (value) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

const getDateKey = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const normalizeAttendanceStatus = (status) => {
  if (status === "leave") return "on-leave";
  if (status === "half-day") return "present";
  return status || "absent";
};

const buildWeeklyChartData = (attendanceRecords, employeeIdsSet, totalEmployees = 0) => {
  const now = new Date();
  const today = getStartOfDay(now);
  const dayIndex = today.getDay();
  const mondayOffset = dayIndex === 0 ? -6 : 1 - dayIndex;
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() + mondayOffset);

  const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const buckets = labels.map((label, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    return {
      day: label,
      key: getDateKey(date),
      // Whether this day has actually happened yet - a future day within
      // the current week genuinely has no attendance data (it hasn't
      // occurred), so it should stay blank rather than being counted as
      // "everyone absent".
      hasOccurred: date.getTime() <= today.getTime(),
      present: 0,
      absent: 0,
    };
  });

  const bucketByDate = new Map(buckets.map((bucket) => [bucket.key, bucket]));

  attendanceRecords.forEach((record) => {
    const employeeId = String(record?.employee || "");
    if (employeeIdsSet && !employeeIdsSet.has(employeeId)) return;

    const key = getDateKey(record?.date);
    const bucket = bucketByDate.get(key);
    if (!bucket) return;

    const status = normalizeAttendanceStatus(record?.status);
    if (status === "present") bucket.present += 1;
  });

  // Absence is "no attendance record for that day" throughout this app
  // (see attendance fix notes) - an explicit 'absent' status record is
  // almost never actually created, so counting only those (as this used
  // to) meant real absences never showed up. For any day that's already
  // happened, everyone not marked present is absent; e.g. 10 employees, 4
  // present on Monday -> 6 absent, not 0.
  return buckets.map(({ day, present, hasOccurred }) => ({
    day,
    present,
    absent: hasOccurred ? Math.max(0, totalEmployees - present) : 0,
  }));
};

const buildMonthlyChartData = (attendanceRecords, employeeIdsSet, totalEmployees = 0) => {
  const now = new Date();
  const today = getStartOfDay(now);
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalWeeks = Math.ceil(daysInMonth / 7);

  const buckets = Array.from({ length: totalWeeks }, (_, index) => {
    // First day of this week-of-the-month bucket, to know whether the
    // week has started yet (same "don't fabricate absences for the
    // future" reasoning as the weekly chart).
    const weekStartDate = new Date(year, month, index * 7 + 1);
    return {
      day: `Week ${index + 1}`,
      hasOccurred: weekStartDate.getTime() <= today.getTime(),
      present: 0,
      absent: 0,
    };
  });

  attendanceRecords.forEach((record) => {
    const employeeId = String(record?.employee || "");
    if (employeeIdsSet && !employeeIdsSet.has(employeeId)) return;

    const date = new Date(record?.date);
    if (Number.isNaN(date.getTime())) return;
    if (date.getFullYear() !== year || date.getMonth() !== month) return;

    const weekIndex = Math.floor((date.getDate() - 1) / 7);
    const bucket = buckets[weekIndex];
    if (!bucket) return;

    const status = normalizeAttendanceStatus(record?.status);
    if (status === "present") bucket.present += 1;
  });

  // Same reasoning as the weekly chart: absence is "not present", derived
  // from the total employee count, not from rare explicit 'absent'
  // records - only for weeks that have actually started.
  return buckets.map(({ day, present, hasOccurred }) => ({
    day,
    present,
    absent: hasOccurred ? Math.max(0, totalEmployees - present) : 0,
  }));
};

const daysUntil = (targetDate) => {
  const today = getStartOfDay(new Date());
  const target = getStartOfDay(targetDate);
  return Math.ceil((target - today) / DAY_MS);
};

const getEmployeeDisplayName = (employee) => {
  const fullName = `${employee?.firstName || ""} ${employee?.lastName || ""}`.trim();
  return (
    fullName ||
    employee?.name ||
    employee?.fullName ||
    employee?.employeeName ||
    employee?.employeeId ||
    "Employee"
  );
};

const isExpiringSoon = (expiryValue, explicitStatus) => {
  if (explicitStatus === "expiring-soon") return true;
  if (!expiryValue) return false;

  // "One month before expiry" per request - was 15 days.
  const days = daysUntil(expiryValue);
  return days >= 0 && days <= 30;
};

function Home() {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [showCompanyWarning, setShowCompanyWarning] = useState(false);
  const [isWarningDismissed, setIsWarningDismissed] = useState(false);
  const [kpis, setKpis] = useState({
    totalWorkers: 0,
    workersOnSite: 0,
    onHoldWorkers: 0,
    revenueCount: 0,
  });
  const [chartData, setChartData] = useState({
    weekly: [],
    monthly: [],
  });
  const [alerts, setAlerts] = useState({
    absentWorkers: [],
    onLeaveWorkers: [],
    availableWorkers: [],
    payments: [],
    taxPayments: [],
    documentExpiring: [],
    siteFinished: [],
  });

  // Lets loadDashboard (below) be safely called again after a Smart Alerts
  // action (assign/reactivate) without setting state on an unmounted page.
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!token) {
      setIsWarningDismissed(false);
      return;
    }

    const key = `company-details-warning-dismissed:${token}`;
    setIsWarningDismissed(sessionStorage.getItem(key) === "true");
  }, [token]);

  const handleDismissWarning = () => {
    setIsWarningDismissed(true);
    if (token) {
      const key = `company-details-warning-dismissed:${token}`;
      sessionStorage.setItem(key, "true");
    }
  };

  useEffect(() => {
    let active = true;

    const loadCompanyStatus = async () => {
      const companyId = user?.companyId || user?.company;
      if (!companyId) {
        if (active) setShowCompanyWarning(true);
        return;
      }

      try {
        const response = await companiesApi.getCompany(companyId);
        const company = response?.data?.data || response?.data;
        if (active) {
          // Debug log to help determine why the warning is shown
          try {
            // eslint-disable-next-line no-console
            console.log('loadCompanyStatus - fetched company:', company, 'isComplete:', isCompanyProfileComplete(company));
          } catch (e) {}
          setShowCompanyWarning(!isCompanyProfileComplete(company));
        }
      } catch (error) {
        if (active) setShowCompanyWarning(true);
      }
    };

    loadCompanyStatus();

    return () => {
      active = false;
    };
  }, [user?.companyId, user?.company]);

  const loadDashboard = useCallback(async () => {
    try {
      const now = new Date();
      const attendanceFrom = new Date(now);
      attendanceFrom.setDate(now.getDate() - 120);

      const [employeesResponse, attendanceResponse, companiesResponse, invoicesResponse, salarySlipsResponse] = await Promise.all([
        employeesApi.getEmployees({ page: 1, limit: 1000 }),
        attendanceApi.getAttendance({ from: attendanceFrom.toISOString(), to: now.toISOString() }),
        companiesApi.getClientCompanies({ page: 1, limit: 1000 }),
          invoicesApi.getInvoices({ page: 1, limit: 1000 }),
          salarySlipsApi.listSalarySlips(),
        ]);

        const employees = parseDataArray(employeesResponse);
        const attendanceRecords = parseDataArray(attendanceResponse);
        const companies = parseDataArray(companiesResponse);
        const invoices = parseDataArray(invoicesResponse);

        const latestAttendanceByEmployee = new Map();
        attendanceRecords.forEach((record) => {
          const employeeId = String(record?.employee || "");
          if (!employeeId) return;

          const current = latestAttendanceByEmployee.get(employeeId);
          const recordDate = new Date(record?.date || 0).getTime();
          const currentDate = new Date(current?.date || 0).getTime();
          if (!current || recordDate > currentDate) {
            latestAttendanceByEmployee.set(employeeId, record);
          }
        });

        const workersOnSite = employees.filter((employee) => {
          const latest = latestAttendanceByEmployee.get(String(employee?._id || ""));
          return normalizeAttendanceStatus(latest?.status) === "present";
        }).length;

        const onHoldWorkers = employees.filter((employee) => {
          const companyId =
            employee?.assignedCompanyId?._id ||
            employee?.assignedCompanyId ||
            employee?.company?._id ||
            employee?.company ||
            null;
          return !companyId;
        }).length;

        // Per-employee set of dates that already have an attendance record
        // (present OR on-leave) - a day with no entry at all is what counts
        // as absent throughout this app (see attendance fix notes), not an
        // explicit 'absent' status record, which is almost never actually
        // created day-to-day.
        const recordedDatesByEmployee = new Map();
        attendanceRecords.forEach((record) => {
          const employeeId = String(record?.employee || "");
          if (!employeeId) return;
          const status = normalizeAttendanceStatus(record?.status);
          if (status !== "present" && status !== "on-leave") return;

          const key = getDateKey(record?.date);
          if (!key) return;
          if (!recordedDatesByEmployee.has(employeeId)) {
            recordedDatesByEmployee.set(employeeId, new Set());
          }
          recordedDatesByEmployee.get(employeeId).add(key);
        });

        const today = getStartOfDay(now);

        // How many consecutive days (ending today) an on-site employee has
        // had no attendance record - matches "Absent from last N day" in
        // the Smart Alerts design. Capped to the 120-day attendance window
        // already fetched above.
        const getAbsentStreakDays = (employeeId) => {
          const recordedDates = recordedDatesByEmployee.get(employeeId);
          let streak = 0;
          for (let i = 0; i < 120; i += 1) {
            const day = new Date(today);
            day.setDate(today.getDate() - i);
            const key = getDateKey(day);
            if (recordedDates && recordedDates.has(key)) break;
            streak += 1;
          }
          return streak;
        };

        const onSiteEmployees = employees.filter((employee) => employee?.assignedStatus === "on-site");
        const onLeaveEmployees = employees.filter(
          (employee) => employee?.lifecycleState === "ON_LEAVE" || employee?.currentLeave?.isOnLeave
        );
        const availableEmployees = employees.filter((employee) => employee?.assignedStatus === "on-hold");
        const siteOverEmployees = employees.filter((employee) => employee?.assignedStatus === "site-over");

        // Only actively-deployed, not-currently-on-leave employees can
        // meaningfully be "absent today" - someone on hold or between
        // sites isn't expected to check in anywhere.
        const onLeaveIds = new Set(onLeaveEmployees.map((e) => String(e?._id || "")));
        const absentWorkers = onSiteEmployees
          .filter((employee) => !onLeaveIds.has(String(employee?._id || "")))
          .map((employee) => {
            const employeeId = String(employee?._id || "");
            const streak = getAbsentStreakDays(employeeId);
            if (streak <= 0) return null;
            return {
              employeeId,
              name: getEmployeeDisplayName(employee),
              meta: `Absent from last ${streak} day${streak === 1 ? "" : "s"}`,
            };
          })
          .filter(Boolean);

        const onLeaveWorkers = onLeaveEmployees.map((employee) => {
          const startedAt = employee?.currentLeave?.startedAt;
          const days = startedAt ? Math.max(1, Math.ceil((today - getStartOfDay(startedAt)) / DAY_MS)) : null;
          return {
            employeeId: employee?._id,
            name: getEmployeeDisplayName(employee),
            meta: days ? `On Leave from last ${days} day${days === 1 ? "" : "s"}` : "On Leave",
          };
        });

        const availableWorkers = availableEmployees.map((employee) => ({
          employeeId: employee?._id,
          name: getEmployeeDisplayName(employee),
        }));

        const siteFinished = siteOverEmployees.map((employee) => ({
          employeeId: employee?._id,
          name: getEmployeeDisplayName(employee),
        }));

        // Salary Slip alert: on-site employees who don't yet have a slip
        // generated for the current month/year.
        const salarySlips = Array.isArray(salarySlipsResponse?.data?.salarySlips)
          ? salarySlipsResponse.data.salarySlips
          : [];
        const currentMonthLabel = now.toLocaleDateString("en-GB", { month: "long" });
        const currentYear = now.getFullYear();
        const hasSlipThisMonth = new Set(
          salarySlips
            .filter((slip) => Number(slip?.year) === currentYear && String(slip?.month || "").toLowerCase() === currentMonthLabel.toLowerCase())
            .map((slip) => String(slip?.employee?._id || slip?.employee || ""))
        );
        const payments = onSiteEmployees
          .filter((employee) => !hasSlipThisMonth.has(String(employee?._id || "")))
          .map((employee) => ({
            employeeId: employee?._id,
            name: getEmployeeDisplayName(employee),
            meta: `${currentMonthLabel} salary slip pending`,
          }));

        const companyNameById = new Map(
          companies.map((company) => [String(company?._id || ""), company?.name || "Unknown company"])
        );

        const taxPayments = invoices
          .map((invoice) => {
            if (!invoice?.dueDate) return null;
            const remainingDays = daysUntil(invoice.dueDate);
            if (remainingDays < 0 || remainingDays > 5) return null;

            return {
              name:
                companyNameById.get(String(invoice?.company || invoice?.companyId || "")) ||
                invoice?.clientName ||
                "Unknown company",
              meta: `${remainingDays} day${remainingDays === 1 ? "" : "s"} remaining to pay tax`,
            };
          })
          .filter(Boolean);

        const documentExpiring = employees
          .flatMap((employee) => {
            const fullName = getEmployeeDisplayName(employee);

            const docs = [
              {
                label: "passport",
                expiry: employee?.passportExpiry,
                status: employee?.passportStatus,
              },
              {
                label: "Emirates ID",
                expiry: employee?.emiratesIdExpiry || employee?.emirateIdExpiry,
                status: employee?.emirateIdStatus || employee?.emiratesIdStatus,
              },
            ];

            return docs
              .map((doc) => {
                if (!isExpiringSoon(doc.expiry, doc.status)) return null;
                return {
                  employeeId: employee?._id || employee?.employeeId,
                  name: `${fullName}'s ${doc.label} is expiring soon`,
                  meta: doc.expiry
                    ? `Expiring on ${new Date(doc.expiry).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`
                    : "Expiring soon",
                };
              })
              .filter(Boolean);
          });

        if (!isMountedRef.current) return;

        setKpis({
          totalWorkers: employees.length,
          workersOnSite,
          onHoldWorkers,
          revenueCount: invoices.length,
        });

        const employeeIdsSet = new Set(employees.map((e) => String(e?._id || e?.id || "")));
        setChartData({
          weekly: buildWeeklyChartData(attendanceRecords, employeeIdsSet, employees.length),
          monthly: buildMonthlyChartData(attendanceRecords, employeeIdsSet, employees.length),
          hasEmployees: employees.length > 0,
        });

        setAlerts({
          absentWorkers,
          onLeaveWorkers,
          availableWorkers,
          payments,
          taxPayments,
          documentExpiring,
          siteFinished,
        });
    } catch (error) {
      if (!isMountedRef.current) return;
      setKpis({ totalWorkers: 0, workersOnSite: 0, onHoldWorkers: 0, revenueCount: 0 });
      setChartData({ weekly: [], monthly: [] });
      setAlerts({
        absentWorkers: [],
        onLeaveWorkers: [],
        availableWorkers: [],
        payments: [],
        taxPayments: [],
        documentExpiring: [],
        siteFinished: [],
      });
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  return (
    <Box
      sx={{
        px: "40px", // left & right = 40px
        pt: "24px", // text from top
        pb: "24px", // bottom gap for highlighted section
      }}
    >
      {showCompanyWarning && !isWarningDismissed && (
        <Box
          sx={{
            mb: "16px",
            border: "1px solid #FDE68A",
            backgroundColor: "var(--bg-surface)BEB",
            borderRadius: "10px",
            p: "12px 14px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <WarningAmberRoundedIcon sx={{ color: "#D97706", fontSize: 18 }} />
            <Typography sx={{ fontSize: 14, fontWeight: 500, color: "#92400E" }}>
              Please complete the company details.
            </Typography>
          </Box>

          <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Button
              onClick={() => navigate("/company-profile")}
              sx={{
                textTransform: "none",
                height: "32px",
                minHeight: "32px",
                px: "14px",
                borderRadius: "8px",
                border: "1px solid #FCD34D",
                color: "#B45309",
                backgroundColor: "var(--bg-surface)",
                "&:hover": {
                  backgroundColor: "var(--bg-warning-soft)",
                },
              }}
            >
              Complete now
            </Button>

            <IconButton
              onClick={handleDismissWarning}
              size="small"
              sx={{
                width: 28,
                height: 28,
                color: "#A16207",
                "&:hover": {
                  backgroundColor: "var(--bg-warning-soft)",
                },
              }}
              aria-label="Close warning"
            >
              <CloseRoundedIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Box>
        </Box>
      )}

      {/* HEADING */}
      <Box
        sx={{
          height: 32,
          display: "flex",
          alignItems: "center",
          mb: "16px", // text → KPI
        }}
      >
        <Typography fontSize={18} fontWeight={400} color="var(--text-secondary)">
          Good morning,&nbsp;
          <Typography
            component="span"
            fontSize={18}
            fontWeight={600}
            color="var(--text-primary)"
          >
            {user?.firstName || "Jonathan"}!
          </Typography>
        </Typography>
      </Box>

      {/* KPI CARDS */}
      <Grid container spacing={2}>
        <KpiGrid kpis={kpis} />
      </Grid>

      {/* ATTENDANCE + ALERT */}
      <Grid container spacing={2} sx={{ mt: "0px" }}>
        <Grid item xs={8}>
          <AttendanceCard
            weeklyData={chartData.weekly}
            monthlyData={chartData.monthly}
            hasEmployees={chartData.hasEmployees}
          />
        </Grid>

        <Grid item xs={4}>
          <AlertBox alerts={alerts} onRefresh={loadDashboard} />
        </Grid>
      </Grid>
    </Box>
  );
}

export default Home;