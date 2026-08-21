import { Box, Button, Snackbar, Alert, Tabs, Tab } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import AddIcon from "@mui/icons-material/Add";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";

dayjs.extend(customParseFormat);

import ExpensesTable from "../components/expenses/ExpensesTable";
import NoDataOverlay from "../components/common/NoDataOverlay";
import AddExpenseModal from "../components/expenses/AddExpenseModal";
import ExpenseDetailPanel from "../components/expenses/ExpenseDetailPanel";
import CompanyExpenseTable from "../components/companyExpenses/CompanyExpenseTable";
import AddCompanyExpenseModal from "../components/companyExpenses/AddCompanyExpenseModal";
import { useAuth } from "../context/AuthContext";
import { useCompanyExpenses } from "../hooks/useCompanyExpenses";
import {
  useCreateCompanyExpenseMutation,
  useUpdateCompanyExpenseMutation,
  useDeleteCompanyExpenseMutation,
} from "../hooks/mutations/useCompanyExpenseMutations";
import { useLaborExpenses } from "../hooks/useLaborExpenses";
import { useEmployees } from "../hooks/useEmployees";
import { useAddExpenseMutation, useReplaceEmployeeExpensesMutation } from "../hooks/mutations/useLaborExpenseMutations";
import { getEmployeeSearchValue } from "../utils/expenseDerivation";

function Expenses() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // "company" matches the reference design's default active tab; "labor"
  // is the pre-existing per-employee advance tracking tab, unchanged below.
  const [activeTab, setActiveTab] = useState("company");

  const [laborPage, setLaborPage] = useState(1);
  const [laborSearch, setLaborSearch] = useState("");
  const { data: laborData, isLoading: loading, error: laborQueryError, refetch: refetchLaborExpenses } = useLaborExpenses(user, { page: laborPage, limit: 10, search: laborSearch });
  const rows = laborData?.rows || [];
  const laborTotal = laborData?.total || 0;
  const isEmployeeViewer = user?.role === "employee";
  // Independent of the labor-expenses query above (they used to be
  // artificially serialized - see useLaborExpenses.js) - only used here to
  // resolve an employee by name/Emirates ID for the Add-Expense picker,
  // which needs every employee, not just ones with existing expense rows.
  // Not needed (and not authorized) for an employee-role viewer, who only
  // ever adds expenses for themself - laborData already carries their own
  // single employee record for that case.
  const employeesQuery = useEmployees(!isEmployeeViewer);
  const employees = isEmployeeViewer ? (laborData?.employees || []) : (employeesQuery.data || []);
  const error = laborQueryError ? (laborQueryError?.response?.data?.message || "Failed to load expenses") : "";
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: "",
    severity: "success",
  });
  const [openAddModal, setOpenAddModal] = useState(false);
  const [selectedRow, setSelectedRow] = useState(null);
  const [editingRow, setEditingRow] = useState(null);

  // Company Expense tab state - entirely separate from the Labor Expense
  // state above, since it's a different backend collection
  // (CompanyExpense, not Employee.expenses).
  const [companySelectedMonth, setCompanySelectedMonth] = useState("");
  const { data: companyRows = [], isLoading: companyLoading, error: companyQueryError, refetch: refetchCompanyExpenses } = useCompanyExpenses(companySelectedMonth);
  const companyError = companyQueryError ? (companyQueryError?.response?.data?.message || "Failed to load company expenses") : "";
  const [openCompanyModal, setOpenCompanyModal] = useState(false);
  const [editingCompanyRow, setEditingCompanyRow] = useState(null);

  const createCompanyExpenseMutation = useCreateCompanyExpenseMutation();
  const updateCompanyExpenseMutation = useUpdateCompanyExpenseMutation();
  const deleteCompanyExpenseMutation = useDeleteCompanyExpenseMutation();
  const addExpenseMutation = useAddExpenseMutation(user);
  const replaceExpensesMutation = useReplaceEmployeeExpensesMutation(user);

  const employeeLookup = useMemo(() => {
    const map = new Map();
    employees.forEach((employee) => {
      const normalized = getEmployeeSearchValue(employee);
      if (employee?._id) map.set(String(employee._id), employee);
      if (normalized) map.set(normalized, employee);
    });
    return map;
  }, [employees]);

  const handleCreateCompanyExpense = async (form) => {
    try {
      const parsedDate = dayjs(form.date, "DD/MM/YYYY");
      await createCompanyExpenseMutation.mutateAsync({
        name: form.name,
        date: parsedDate.isValid() ? parsedDate.toISOString() : new Date().toISOString(),
        amount: Number(form.amount || 0),
      });
      handleNotify("Expense added", "success");
      setOpenCompanyModal(false);
      setEditingCompanyRow(null);
    } catch (err) {
      handleNotify(err?.response?.data?.message || "Failed to add expense", "error");
    }
  };

  const handleUpdateCompanyExpense = async (form) => {
    if (!editingCompanyRow?.id) return;
    try {
      const parsedDate = dayjs(form.date, "DD/MM/YYYY");
      await updateCompanyExpenseMutation.mutateAsync({
        id: editingCompanyRow.id,
        payload: {
          name: form.name,
          date: parsedDate.isValid() ? parsedDate.toISOString() : new Date().toISOString(),
          amount: Number(form.amount || 0),
        },
      });
      handleNotify("Expense updated", "success");
      setOpenCompanyModal(false);
      setEditingCompanyRow(null);
    } catch (err) {
      handleNotify(err?.response?.data?.message || "Failed to update expense", "error");
    }
  };

  const handleSubmitCompanyExpenseModal = (form) => {
    if (editingCompanyRow) return handleUpdateCompanyExpense(form);
    return handleCreateCompanyExpense(form);
  };

  const handleDeleteCompanyExpense = async (row) => {
    try {
      await deleteCompanyExpenseMutation.mutateAsync(row.id);
      handleNotify("Expense deleted", "success");
    } catch (err) {
      handleNotify(err?.response?.data?.message || "Failed to delete expense", "error");
    }
  };

  // Keep the panel open only if the previously-selected row still exists
  // after rows refreshes (e.g. after edit/delete). Never auto-open a row
  // that wasn't already selected by the user - the panel should only
  // appear when "View" is clicked. Not a data-fetching effect (React
  // Query owns that) - just pruning local selection state to match fresh
  // data, same category as CompanyDetail.jsx's draftCompany sync.
  useEffect(() => {
    setSelectedRow((prev) => {
      if (!prev) return null;
      return rows.find((row) => row.id === prev.id) || null;
    });
  }, [rows]);

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
    await replaceExpensesMutation.mutateAsync({ employeeId, records: nextRecords });
  };

  const handleCreateExpense = async (form) => {
    const amount = Number(form.amount || 0);
    const employee = resolveEmployeeFromForm(form) || (user?.role === "employee" ? employees[0] : null);

    if (!employee?._id) {
      handleNotify("Employee not found for the entered name or Emirates ID", "error");
      return;
    }

    try {
      const response = await addExpenseMutation.mutateAsync({
        employeeId: employee._id,
        type: form.expenseType === "Other" ? "other" : String(form.expenseType || "other").toLowerCase(),
        amount,
        date: new Date().toISOString(),
        note: form.expenseType === "Other" ? form.expenseLabel : form.expenseType,
      });

      if (response?.data) {
        handleNotify("Expense added", "success");
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
  const hasCompanyRows = companyRows.length > 0;

  // Whichever tab is active decides what the header's "Add Expense" button
  // opens - the Company Expense modal (Expense Name/Date/Paid Amount) or
  // the existing Labor Expense one (Employee Name/Emirates ID/Expense
  // Type/Amount), per the reference design.
  const handleAddExpenseClick = () => {
    if (activeTab === "company") {
      setEditingCompanyRow(null);
      setOpenCompanyModal(true);
    } else {
      setEditingRow(null);
      setOpenAddModal(true);
    }
  };

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
      {/* HEADER: tabs (left) + Add Expense (right), same row */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Tabs
          value={activeTab}
          onChange={(_, value) => setActiveTab(value)}
          sx={{
            minHeight: 32,
            "& .MuiTab-root": {
              textTransform: "none",
              fontSize: 14,
              fontWeight: 500,
              minHeight: 32,
              px: 1.5,
            },
          }}
        >
          <Tab label="Company Expense" value="company" />
          <Tab label="Labor Expense" value="labor" />
        </Tabs>

        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleAddExpenseClick}
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

      {/* BODY: whichever tab is active - each has its own loading/error/
          empty/table handling, entirely independent of the other tab's
          data, so switching tabs never has to refetch anything already
          loaded. */}
      {activeTab === "company" ? (
        companyError && !companyLoading && !hasCompanyRows ? (
          <NoDataOverlay
            title="Company expense data unavailable"
            description={companyError}
            actionLabel="Retry"
            onCancel={() => navigate("/")}
            onAction={() => refetchCompanyExpenses()}
          />
        ) : !companyLoading && !hasCompanyRows ? (
          <NoDataOverlay
            title="No Expense Added"
            description="Add your first expense to start tracking expense."
            actionLabel="Add Expense"
            onCancel={() => navigate("/")}
            onAction={() => {
              setEditingCompanyRow(null);
              setOpenCompanyModal(true);
            }}
          />
        ) : (
          <Box
            sx={{
              bgcolor: "var(--bg-surface)",
              border: "1px solid var(--border-card)",
              borderRadius: "12px",
              p: "16px",
            }}
          >
            <CompanyExpenseTable
              rows={companyRows}
              selectedMonth={companySelectedMonth}
              onMonthChange={setCompanySelectedMonth}
              onEdit={(row) => {
                setEditingCompanyRow(row);
                setOpenCompanyModal(true);
              }}
              onDelete={handleDeleteCompanyExpense}
            />
          </Box>
        )
      ) : error && !loading && !hasRows ? (
        <NoDataOverlay
          title="Expense data unavailable"
          description={error}
          actionLabel="Retry"
          onCancel={() => navigate("/")}
          onAction={() => refetchLaborExpenses()}
        />
      ) : !loading && !hasRows ? (
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
      ) : (
        /* OUTER WRAPPER CARD — encloses both the table card and the detail
            card so they read as one cohesive group, with a 16px (gap: 2) gap
            between them, matching the target design. */
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
              }}
            >
              <ExpensesTable
                rows={rows}
                onView={(row) => setSelectedRow(row)}
                selectedId={selectedRow?.id}
                server={!isEmployeeViewer}
                page={laborPage}
                onPageChange={setLaborPage}
                total={laborTotal}
                search={laborSearch}
                onSearchChange={(value) => {
                  setLaborSearch(value);
                  setLaborPage(1);
                }}
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
      )}

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

      <AddCompanyExpenseModal
        open={openCompanyModal}
        onClose={() => {
          setOpenCompanyModal(false);
          setEditingCompanyRow(null);
        }}
        initialValues={
          editingCompanyRow
            ? {
                name: editingCompanyRow.name,
                date: editingCompanyRow.date
                  ? new Date(editingCompanyRow.date).toLocaleDateString("en-GB")
                  : "",
                amount: editingCompanyRow.amount ?? "",
              }
            : undefined
        }
        submitLabel={editingCompanyRow ? "Update Expense" : "Add Expense"}
        onSubmit={handleSubmitCompanyExpenseModal}
      />
    </Box>
  );
}

export default Expenses;