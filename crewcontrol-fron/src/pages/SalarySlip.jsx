import { Box, Button, Snackbar, Alert } from "@mui/material";
import { useEffect, useState } from "react";
import AddIcon from "@mui/icons-material/Add";
import { useNavigate } from "react-router-dom";

import SalarySlipTable from "../components/salarySlips/SalarySlipTable";
import NoDataOverlay from "../components/common/NoDataOverlay";
import { salarySlipsApi } from "../api/salarySlips";
import { employeesApi } from "../api/employees";
import { useAuth } from "../context/AuthContext";

function formatInvoiceDate(slip) {
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

function getEmployeeDisplayName(employee, slip) {
  return (
    employee?.name ||
    [employee?.firstName, employee?.lastName].filter(Boolean).join(" ").trim() ||
    slip?.employeeName ||
    "Employee"
  );
}

function normalizeSlipRows(items = [], employeesById = new Map(), fallbackEmployee = null) {
  return items.map((slip, index) => {
    const employeeId = String(slip?.employee?._id || slip?.employee || slip?.employeeId || "");
    const employee = employeesById.get(employeeId);
    const advanceAmount = Array.isArray(slip?.deductionsDetails)
      ? slip.deductionsDetails
          .filter((item) => String(item?.type || "").toLowerCase() === "advance")
          .reduce((sum, item) => sum + Number(item?.amount || 0), 0)
      : Number(slip?.advanceAmount || slip?.deductions || 0);

    return {
      id: String(slip?._id || slip?.id || `${employeeId}-${index}`),
      invoiceNo: slip?.invoiceNo || `SLIP-${String(slip?._id || index).slice(-6).toUpperCase()}`,
      employeeId: employeeId || slip?.employeeId || "",
      employeeName: getEmployeeDisplayName(employee || fallbackEmployee, slip),
      trade: employee?.trade || employee?.position || fallbackEmployee?.trade || fallbackEmployee?.position || slip?.trade || "—",
      invoiceDate: formatInvoiceDate(slip),
      rateHr: Number(employee?.ratePerHour || employee?.rate || slip?.rateHr || 0),
      advance: Number(advanceAmount || 0),
      netAmount: Number(slip?.netSalary ?? slip?.netAmount ?? 0),
      slipData: slip?.slipData || null,
      raw: slip,
    };
  });
}

function SalarySlip() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" });

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        setLoading(true);
        setError("");

        if (user?.role === "employee") {
          const response = await salarySlipsApi.listSalarySlips();
          const items = Array.isArray(response?.data?.salarySlips)
            ? response.data.salarySlips
            : Array.isArray(response?.data?.data)
              ? response.data.data
              : [];
          if (active) setRows(normalizeSlipRows(items, new Map(), user));
          return;
        }

        const employeesResponse = await employeesApi.getEmployees({ page: 1, limit: 500 });
        const employees = Array.isArray(employeesResponse?.data?.data)
          ? employeesResponse.data.data
          : Array.isArray(employeesResponse?.data?.employees)
            ? employeesResponse.data.employees
            : [];
        const slipResults = await Promise.allSettled(
          employees.map((employee) => salarySlipsApi.listSalarySlips(employee?._id))
        );

        const collected = [];
        slipResults.forEach((result, index) => {
          if (result.status !== "fulfilled") return;
          const slipItems = Array.isArray(result.value?.data?.salarySlips)
            ? result.value.data.salarySlips
            : Array.isArray(result.value?.data?.data)
              ? result.value.data.data
              : [];
          const employee = employees[index];
          collected.push(...normalizeSlipRows(slipItems, new Map([[String(employee?._id || ""), employee]])));
        });

        collected.sort((a, b) => new Date(b.raw?.createdAt || 0) - new Date(a.raw?.createdAt || 0));

        if (active) setRows(collected);
      } catch (err) {
        if (active) {
          setRows([]);
          setError(err?.response?.data?.message || "Failed to load salary slips");
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false };
  }, []);

  const handleNotify = (message, severity = "success") => {
    setSnackbar({ open: true, message, severity });
  };

  const handleCloseSnackbar = () => {
    setSnackbar((prev) => ({ ...prev, open: false }));
  };

  const hasRows = rows.length > 0;

  if (error && !loading && !hasRows) {
    return (
      <NoDataOverlay
        title="Salary slip unavailable"
        description={error}
        actionLabel="Retry"
        onCancel={() => navigate("/")}
        onAction={() => window.location.reload()}
      />
    );
  }

  if (!loading && !hasRows) {
    return (
      <NoDataOverlay
        title="No salary slip yet"
        description="Generate your first salary slip to start tracking payments."
        actionLabel="Generate Salary Slip"
        onCancel={() => navigate("/")}
        onAction={() => navigate("/salary-slip/generate")}
      />
    );
  }

  return (
    <Box
      sx={{
        px: "40px",
        py: "24px",
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      {/* HEADER ACTION */}
      <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          sx={{
            height: 32,
            borderRadius: "8px",
            textTransform: "none",
            fontSize: 14,
          }}
          onClick={() => navigate("/salary-slip/generate")}
        >
          Generate Salary Slip
        </Button>
      </Box>

      {/* TABLE CARD */}
      <Box
        sx={{
          bgcolor: "var(--bg-surface)",
          border: "1px solid var(--border-card)",
          borderRadius: "12px",
          p: "20px",
        }}
      >
        <SalarySlipTable rows={rows} onNotify={handleNotify} />
      </Box>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert onClose={handleCloseSnackbar} severity={snackbar.severity} sx={{ width: "100%" }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default SalarySlip;
