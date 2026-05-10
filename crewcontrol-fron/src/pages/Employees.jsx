import { useEffect, useState } from "react";
import { Box, Button } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useNavigate } from "react-router-dom";
import { employeesApi } from "../api/employees";

import EmployeesTabs from "../components/employees/EmployeesTabs";

/* ===== TABLES ===== */
import EmployeesTable from "../components/employees/EmployeesTable";
import AssignedTable from "../components/employees/assigned/AssignedTable";
import AttendanceTable from "../components/employees/attendance/AttendanceTable";
import PassportTable from "../components/employees/passport/PassportTable";
import TrackEmployee from "../components/employees/track/TrackEmployee";

/* ===== KPI ROWS ===== */
import AssignedKpiRow from "../components/employees/assigned/AssignedKpiRow";
import AttendanceKpiRow from "../components/employees/attendance/AttendanceKpiRow";
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

const getPassportStatus = (passportExpiry) => {
  if (!passportExpiry) return "expired";

  const expiry = new Date(passportExpiry);
  if (Number.isNaN(expiry.getTime())) return "expired";

  const now = new Date();
  if (expiry < now) return "expired";

  const daysLeft = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
  return daysLeft <= 60 ? "expiring-soon" : "valid";
};

const mapEmployeeToRow = (employee) => {
  const firstName = employee?.firstName || "";
  const lastName = employee?.lastName || "";
  const fullName = `${firstName} ${lastName}`.trim() || employee?.name || "-";
  const assignedCompany = employee?.assignedCompanyId?.name || "-";

  return {
    id: employee?.employeeId || employee?._id || "-",
    name: fullName,
    phone: employee?.mobile || employee?.mobileNumber || "-",
    trade: employee?.trade || employee?.position || "-",
    rate: Number(employee?.ratePerHour || employee?.salary || 0).toFixed(2),
    joined: formatDate(employee?.joiningDate || employee?.joinDate),

    company: assignedCompany,
    project: "-",
    startDate: formatDate(employee?.joiningDate || employee?.joinDate),
    assignedStatus: assignedCompany !== "-" ? "assigned" : "unassigned",

    checkIn: "-",
    checkOut: "-",
    totalWorks: 0,
    totalAbsent: 0,
    attendanceStatus: "absent",

    passportNo: employee?.passportNo || "-",
    passportExpiry: formatDate(employee?.passportExpiry),
    passportStatus: getPassportStatus(employee?.passportExpiry),
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
  const [employeeRows, setEmployeeRows] = useState([]);
  const [loading, setLoading] = useState(true);

  /* ================= RESET KPI ON TAB CHANGE ================= */
  useEffect(() => {
    setActiveAssignedStatus(null);
    setActiveAttendanceStatus(null);
    setActivePassportStatus(null);
  }, [activeTab]);

  useEffect(() => {
    let active = true;

    const loadEmployees = async () => {
      try {
        setLoading(true);
        const response = await employeesApi.getEmployees({ page: 1, limit: 500 });
        const employees = Array.isArray(response?.data?.employees)
          ? response.data.employees
          : Array.isArray(response?.data?.data)
            ? response.data.data
            : [];
        if (active) {
          setEmployeeRows(employees.map(mapEmployeeToRow));
        }
      } catch (error) {
        if (active) {
          setEmployeeRows([]);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadEmployees();

    return () => {
      active = false;
    };
  }, []);

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
            bgcolor: "#FFFFFF",
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
            bgcolor: "#FFFFFF",
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

          <AssignedTable rows={employeeRows} activeStatus={activeAssignedStatus} />
        </Box>
      )}

      {/* ================= ATTENDANCE ================= */}
      {activeTab === "attendance" && (
        <Box
          sx={{
            bgcolor: "#FFFFFF",
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
            data={employeeRows}
            activeStatus={activeAttendanceStatus}
            onChange={setActiveAttendanceStatus}
          />

          <AttendanceTable rows={employeeRows} activeStatus={activeAttendanceStatus} />
        </Box>
      )}

      {/* ================= PASSPORT STATUS ================= */}
      {activeTab === "passport" && (
        <Box
          sx={{
            bgcolor: "#FFFFFF",
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

      {/* ================= TRACK EMPLOYEE ================= */}
      {activeTab === "track" && <TrackEmployee />}
    </Box>
  );
};

export default Employees;
