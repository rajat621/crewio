import { Box, Button } from "@mui/material";
import { useEffect, useState } from "react";
import AddIcon from "@mui/icons-material/Add";
import { useNavigate } from "react-router-dom";

import CompanyGrid from "../components/company/CompanyGrid";
import AssignEmployeeDialog from "../components/company/AssignEmployeeDialog";
import NoDataOverlay from "../components/common/NoDataOverlay";
import { companiesApi } from "../api/companies";
import { employeesApi } from "../api/employees";
import { attendanceApi } from "../api/attendance";

const formatDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const normalizeAttendanceStatus = (status) => {
  if (status === "leave") return "on-leave";
  if (status === "half-day") return "present";
  return status || "";
};

const parseDataArray = (response) => {
  if (Array.isArray(response?.data?.data)) return response.data.data;
  if (Array.isArray(response?.data?.employees)) return response.data.employees;
  if (Array.isArray(response?.data)) return response.data;
  return [];
};

const getCompanyIdFromEmployee = (employee) =>
  String(
    employee?.assignedCompanyId?._id ||
      employee?.assignedCompanyId ||
      employee?.company?._id ||
      employee?.company ||
      ""
  );

const buildLatestStatusByEmployee = (attendanceRecords) => {
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

const mapCompanyToCard = (company, assignedEmployees = [], latestStatusByEmployee = new Map()) => {
  const start = formatDate(company?.contractStartDate);
  const end = formatDate(company?.contractEndDate);

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
    id: company?._id,
    name: company?.name || "Unnamed company",
    status: company?.status === "inactive" ? "deactivate" : "active",
    dateRange: start && end ? `${start} - ${end}` : "No contract period",
    totalWorkers: assignedEmployees.length,
    present: stats.present,
    absent: stats.absent,
    onLeave: stats.onLeave,
    phone: company?.telephoneNumber || company?.mobileNumber || "-",
    poBox: company?.poBox || "-",
    fax: company?.faxNumber || "-",
    address: company?.address || "-",
    trn: company?.trn || "-",
    workers: [],
  };
};

function Company() {
  const navigate = useNavigate();
  const [companyRows, setCompanyRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState(null);

  const loadCompanies = async () => {
    try {
      setLoading(true);
      const now = new Date();
      const fromDate = new Date(now);
      fromDate.setDate(now.getDate() - 120);

      const [companiesResponse, employeesResponse, attendanceResponse] = await Promise.all([
        companiesApi.getClientCompanies(),
        employeesApi.getEmployees({ page: 1, limit: 5000 }),
        attendanceApi.getAttendance({ from: fromDate.toISOString(), to: now.toISOString() }),
      ]);

      const companies = parseDataArray(companiesResponse);
      const employees = parseDataArray(employeesResponse);
      const attendanceRecords = parseDataArray(attendanceResponse);
      const latestStatusByEmployee = buildLatestStatusByEmployee(attendanceRecords);

      const rows = companies.map((company) => {
        const companyId = String(company?._id || "");
        const assignedEmployees = employees.filter(
          (employee) => getCompanyIdFromEmployee(employee) === companyId
        );

        return mapCompanyToCard(company, assignedEmployees, latestStatusByEmployee);
      });

      setCompanyRows(rows);
    } catch (error) {
      setCompanyRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;

    const loadCompaniesSafe = async () => {
      try {
        await loadCompanies();
      } catch (error) {
        if (active) {
          setCompanyRows([]);
        }
      }
    };

    loadCompaniesSafe();

    return () => {
      active = false;
    };
  }, []);

  const hasCompanies = companyRows.length > 0;

  const handleDeactivateCompany = async (companyId, currentStatus) => {
    let previousRows = [];
    const nextStatus = currentStatus === "active" ? "deactivate" : "active";
    const apiStatus = currentStatus === "active" ? "inactive" : "active";

    setCompanyRows((prev) => {
      previousRows = prev;
      return prev.map((item) =>
        item.id === companyId ? { ...item, status: nextStatus } : item
      );
    });

    try {
      await companiesApi.updateCompany(companyId, { status: apiStatus });
    } catch (error) {
      setCompanyRows(previousRows);
    }
  };

  const handleOpenAssignDialog = (companyId) => {
    setSelectedCompanyId(companyId);
    setIsAssignDialogOpen(true);
  };

  const handleCloseAssignDialog = () => {
    setIsAssignDialogOpen(false);
    setSelectedCompanyId(null);
  };

  const handleAssignedEmployeesUpdated = async () => {
    await loadCompanies();
  };

  if (!loading && !hasCompanies) {
    return (
      <NoDataOverlay
        title="No companies added yet"
        description="Add a company to start assigning workers and generating invoices."
        actionLabel="Add Companies"
        onCancel={() => navigate("/")}
        onAction={() => navigate("/add-company")}
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
      {/* ================= ONLY ADD COMPANY BUTTON ================= */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "flex-end",
        }}
      >
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => navigate("/add-company")}
          sx={{
            height: 32,
            textTransform: "none",
            px: 2,
          }}
        >
          Add Company
        </Button>
      </Box>

      {/* ================= COMPANY CARDS CONTAINER ================= */}
      <Box
        sx={{
          bgcolor: "var(--bg-surface)",
          border: "1px solid var(--border-card)",
          borderRadius: 1.5,
          p: "20px",
        }}
      >
        <CompanyGrid
          companies={companyRows}
          onDeactivateCompany={handleDeactivateCompany}
          onAssignEmployees={handleOpenAssignDialog}
        />
      </Box>

      <AssignEmployeeDialog
        open={isAssignDialogOpen}
        onClose={handleCloseAssignDialog}
        companyId={selectedCompanyId}
        onAssigned={handleAssignedEmployeesUpdated}
      />
    </Box>
  );
}

export default Company;

