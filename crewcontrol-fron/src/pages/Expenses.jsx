import { Box, Button, Snackbar, Alert } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import AddIcon from "@mui/icons-material/Add";
import { useNavigate } from "react-router-dom";

import ExpensesTable from "../components/expenses/ExpensesTable";
import NoDataOverlay from "../components/common/NoDataOverlay";
import AddExpenseModal from "../components/expenses/AddExpenseModal";
import ExpenseDetailPanel from "../components/expenses/ExpenseDetailPanel";
import { employeesApi } from "../api/employees";
import { expensesApi } from "../api/expenses";
import { useAuth } from "../context/AuthContext";

const DEDUCTION_TYPES = new Set(["deduction", "fine", "penalty", "penalty amount", "advance deduction"]);

function formatDateLabel(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function normalizeExpenseType(type = "", note = "") {
  const raw = String(type || note || "other").trim().toLowerCase();
  if (!raw) return "other";
  if (DEDUCTION_TYPES.has(raw)) return "deduction";
  if (raw === "gas") return "gas";
  if (raw === "advance") return "advance";
  if (raw === "food") return "other food";
  if (raw === "travel") return "other travel";
  return raw;
}

function normalizeExpenseRecords(records = []) {
  return records
    .map((record, index) => ({
      id: String(record?._id || record?.id || `${Date.now()}-${index}`),
      type: normalizeExpenseType(record?.type, record?.note),
      label: record?.note || record?.type || "Expense",
      amount: Number(record?.amount || 0),
      date: record?.date || new Date().toISOString(),
      note: record?.note || "",
      raw: record,
    }))
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
}

function summarizeEmployeeExpenses(employee, expensePayload) {
  const records = Array.isArray(expensePayload?.records)
    ? expensePayload.records
    : Array.isArray(expensePayload)
      ? expensePayload
      : [];

  const latestTimestamp = records.reduce((max, record) => {
    const ts = new Date(record?.date || 0).getTime();
    return Number.isNaN(ts) ? max : Math.max(max, ts);
  }, 0);

  const paymentHistory = normalizeExpenseRecords(records).map((record) => ({
    ...record,
    amount: Number(record.amount || 0),
    date: formatDateLabel(record.date),
  }));

  const totalAdvance = paymentHistory.reduce((sum, record) => sum + Number(record.amount || 0), 0);
  const deduction = paymentHistory
    .filter((record) => DEDUCTION_TYPES.has(String(record.type || "").toLowerCase()))
    .reduce((sum, record) => sum + Number(record.amount || 0), 0);

  const breakdown = paymentHistory.reduce((acc, record) => {
    const key = record.type || "other";
    acc[key] = (acc[key] || 0) + Number(record.amount || 0);
    return acc;
  }, {});

  return {
    id: String(employee?._id || employee?.id || employee?.employeeId || ""),
    employeeId: String(employee?._id || employee?.id || employee?.employeeId || ""),
    employeeName:
      employee?.name ||
      [employee?.firstName, employee?.lastName].filter(Boolean).join(" ").trim() ||
      employee?.employeeName ||
      "Employee",
    emiratesId: employee?.emiratesId || employee?.employeeId || "",
    trade: employee?.trade || employee?.position || "—",
    totalAdvance,
    deduction,
    remainingAmount: totalAdvance - deduction,
    breakdown,
    paymentHistory,
    records,
    latestTimestamp,
    rawEmployee: employee,
  };
}

function getEmployeeSearchValue(employee = {}) {
  return `${employee?.name || ""} ${employee?.firstName || ""} ${employee?.lastName || ""} ${employee?.emiratesId || ""} ${employee?.employeeId || ""}`
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function Expenses() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [rows, setRows] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: "",
    severity: "success",
  });
  const [openAddModal, setOpenAddModal] = useState(false);
  const [selectedRow, setSelectedRow] = useState(null);
  const [editingRow, setEditingRow] = useState(null);

  const employeeLookup = useMemo(() => {
    const map = new Map();
    employees.forEach((employee) => {
      const normalized = getEmployeeSearchValue(employee);
      if (employee?._id) map.set(String(employee._id), employee);
      if (normalized) map.set(normalized, employee);
    });
    return map;
  }, [employees]);

  const loadExpenses = async () => {
    setLoading(true);
    setError("");
    try {
      let employeeList = [];

      if (user?.role === "employee" && user?.employeeId) {
        const selfResponse = await employeesApi.getEmployee(user.employeeId);
        const selfEmployee = selfResponse?.data?.data || selfResponse?.data?.employee || selfResponse?.data;
        employeeList = selfEmployee ? [selfEmployee] : [];
      } else {
        const employeesResponse = await employeesApi.getEmployees({ page: 1, limit: 500 });
        employeeList = Array.isArray(employeesResponse?.data?.data)
          ? employeesResponse.data.data
          : Array.isArray(employeesResponse?.data?.employees)
            ? employeesResponse.data.employees
            : [];
      }

      setEmployees(employeeList);

      const expenseResults = await Promise.allSettled(
        employeeList.map((employee) => expensesApi.getExpenses(employee?._id))
      );

      const nextRows = [];
      expenseResults.forEach((result, index) => {
        if (result.status !== "fulfilled") return;
        const employee = employeeList[index];
        const payload = result.value?.data?.expenses || result.value?.data?.data || result.value?.data;
        const row = summarizeEmployeeExpenses(employee, payload);
        if (row.paymentHistory.length) {
          nextRows.push(row);
        }
      });

      nextRows.sort((a, b) => {
        return Number(b.latestTimestamp || 0) - Number(a.latestTimestamp || 0);
      });

      setRows(nextRows);
      // Keep the panel open only if the previously-selected row still exists
      // after a refresh (e.g. after edit/delete). Never auto-open a row that
      // wasn't already selected by the user — the panel should only appear
      // when "View" is clicked.
      setSelectedRow((prev) => {
        if (!prev) return null;
        return nextRows.find((row) => row.id === prev.id) || null;
      });
    } catch (err) {
      setRows([]);
      setError(err?.response?.data?.message || "Failed to load expenses");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExpenses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role, user?.employeeId]);

  const handleNotify = (message, severity = "success") => {
    setSnackbar({
      open: true,
      message,
      severity,
    });
  };

  const handleCloseSnackbar = () => {
    setSnackbar((prev) => ({
      ...prev,
      open: false,
    }));
  };

  const resolveEmployeeFromForm = (form) => {
    const needle = `${form.employeeName || ""} ${form.emiratesId || ""}`.toLowerCase().replace(/\s+/g, " ").trim();
    if (!needle) return null;

    return (
      employees.find((employee) => getEmployeeSearchValue(employee).includes(needle)) ||
      employeeLookup.get(needle) ||
      null
    );
  };

  const persistRecords = async (employeeId, nextRecords) => {
    await expensesApi.replaceEmployeeExpenses(employeeId, {
      records: nextRecords,
    });
    await loadExpenses();
  };

  const handleCreateExpense = async (form) => {
    const amount = Number(form.amount || 0);
    const employee = resolveEmployeeFromForm(form) || (user?.role === "employee" ? employees[0] : null);

    if (!employee?._id) {
      handleNotify("Employee not found for the entered name or Emirates ID", "error");
      return;
    }

    try {
      const response = await expensesApi.addExpense({
        employeeId: employee._id,
        type: form.expenseType === "Other" ? "other" : String(form.expenseType || "other").toLowerCase(),
        amount,
        date: new Date().toISOString(),
        note: form.expenseType === "Other" ? form.expenseLabel : form.expenseType,
      });

      if (response?.data) {
        handleNotify("Expense added", "success");
        await loadExpenses();
      }
    } catch (err) {
      handleNotify(err?.response?.data?.message || "Failed to add expense", "error");
    }
  };

  const handleEditLatest = async () => {
    if (!selectedRow) return;
    const latestRecord = selectedRow.records?.[0];
    if (!latestRecord) return;
    setEditingRow({ row: selectedRow, record: latestRecord });
    setOpenAddModal(true);
  };

  const handleDeleteLatest = async () => {
    if (!selectedRow) return;
    const remaining = (selectedRow.records || []).slice(1);
    try {
      await persistRecords(selectedRow.employeeId, remaining);
      handleNotify("Expense deleted", "success");
    } catch (err) {
      handleNotify(err?.response?.data?.message || "Failed to delete expense", "error");
    }
  };

  const handleSubmitExpenseModal = async (form) => {
    if (editingRow?.row && editingRow?.record) {
      const amount = Number(form.amount || 0);
      const nextRecord = {
        _id: editingRow.record.raw?._id || editingRow.record.id,
        ...editingRow.record.raw,
        type: form.expenseType === "Other" ? "other" : String(form.expenseType || "other").toLowerCase(),
        amount,
        note: form.expenseType === "Other" ? form.expenseLabel : form.expenseType,
        date: new Date().toISOString(),
      };
      const nextRecords = (editingRow.row.records || []).map((record) =>
        String(record._id || record.id) === String(editingRow.record.id) ? nextRecord : record
      );
      try {
        await persistRecords(editingRow.row.employeeId, nextRecords);
        handleNotify("Expense updated", "success");
      } catch (err) {
        handleNotify(err?.response?.data?.message || "Failed to update expense", "error");
      } finally {
        setEditingRow(null);
      }
      return;
    }

    await handleCreateExpense(form);
  };

  const hasRows = rows.length > 0;

  if (!loading && !hasRows && error) {
    return (
      <NoDataOverlay
        title="Expense data unavailable"
        description={error}
        actionLabel="Retry"
        onCancel={() => navigate("/")}
        onAction={loadExpenses}
      />
    );
  }

if (!loading && !hasRows) {
  return (
    <>
      <NoDataOverlay
        title="No Expense Added"
        description="Add your first expense to start tracking expense."
        actionLabel="Add Expense"
        onCancel={() => navigate("/")}
        onAction={() => {
          setEditingRow(null);
          setOpenAddModal(true);
        }}
      />

      <AddExpenseModal
        open={openAddModal}
        onClose={() => {
          setOpenAddModal(false);
          setEditingRow(null);
        }}
        onSubmit={handleSubmitExpenseModal}
      />
    </>
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
      <Box
        sx={{
          display: "flex",
          justifyContent: "flex-end",
        }}
      >
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => {
            setEditingRow(null);
            setOpenAddModal(true);
          }}
          sx={{
            height: 32,
            borderRadius: "8px",
            textTransform: "none",
            fontSize: 14,
          }}
        >
          Add Expense
        </Button>
      </Box>

      {/* OUTER WRAPPER CARD — encloses both the table card and the detail
          card so they read as one cohesive group, with a 16px (gap: 2) gap
          between them, matching the target design. */}
      <Box
        sx={{
          bgcolor: "var(--bg-surface)",
          border: "1px solid var(--border-card)",
          borderRadius: "12px",
          p: "16px",
        }}
      >
        <Box
          sx={{
            display: "flex",
            gap: 2,
            alignItems: "flex-start",
          }}
        >
          {/* TABLE CARD */}
          <Box
            sx={{
              flex: 1,
              bgcolor: "var(--bg-surface)",
              // border: "1px solid var(--border-card)",
              // borderRadius: "12px",
              // p: "20px",
              // minWidth: 0,
            }}
          >
            <ExpensesTable
              rows={rows}
              onView={(row) => setSelectedRow(row)}
              selectedId={selectedRow?.id}
            />
          </Box>

          {selectedRow ? (
            <ExpenseDetailPanel
              row={selectedRow}
              onClose={() => setSelectedRow(null)}
              onEdit={handleEditLatest}
              onDelete={handleDeleteLatest}
            />
          ) : null}
        </Box>
      </Box>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "right",
        }}
      >
        <Alert
          severity={snackbar.severity}
          onClose={handleCloseSnackbar}
          sx={{ width: "100%" }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>

      <AddExpenseModal
        open={openAddModal}
        onClose={() => {
          setOpenAddModal(false);
          setEditingRow(null);
        }}
        prefillEmployee={editingRow?.row?.rawEmployee}
        initialValues={
          editingRow?.record
            ? {
                expenseType: (() => {
                  const rawType = String(editingRow.record.raw?.type || "").toLowerCase();
                  if (rawType === "advance") return "Advance";
                  if (rawType === "gas") return "Gas";
                  if (rawType === "other") return "Other";
                  if (rawType === "fine" || rawType === "deduction" || rawType === "penalty") return "Penalty Amount";
                  return "Other";
                })(),
                otherDescription: editingRow.record.raw?.note || "",
                amount: editingRow.record.raw?.amount ?? "",
              }
            : undefined
        }
        submitLabel={editingRow ? "Update Expense" : "Add Expense"}
        onSubmit={handleSubmitExpenseModal}
      />
    </Box>
  );
}

export default Expenses;