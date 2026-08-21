import { Box, Button, Snackbar, Alert } from "@mui/material";
import { useEffect, useState } from "react";
import AddIcon from "@mui/icons-material/Add";
import { useNavigate, useSearchParams } from "react-router-dom";

import SalarySlipTable from "../components/salarySlips/SalarySlipTable";
import NoDataOverlay from "../components/common/NoDataOverlay";
import { useSalarySlips } from "../hooks/useSalarySlips";
import { useAuth } from "../context/AuthContext";

function SalarySlip() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  // Persisted in the URL (not just component state) so the selected month
  // survives navigating away and back, matching the requirement - plain
  // useState alone (what the Attendance page itself uses) resets on
  // remount, which is exactly what "preserve when navigating back" rules
  // out here.
  const selectedMonth = searchParams.get("month") || "";
  const setSelectedMonth = (value) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("month", value);
      return next;
    });
  };

  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const handle = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [searchInput]);
  // Changing the month filter re-scopes the server query - always land
  // back on page 1 of the new (differently-sized) filtered result, same
  // pattern as Employees.jsx's KPI-card tabs.
  const [prevMonth, setPrevMonth] = useState(selectedMonth);
  if (prevMonth !== selectedMonth) {
    setPrevMonth(selectedMonth);
    setPage(1);
  }

  const { data, isLoading: loading, error: queryError } = useSalarySlips(selectedMonth, user, page, PAGE_SIZE, search);
  const rows = data?.rows || [];
  const total = data?.total ?? 0;
  const error = queryError ? (queryError?.response?.data?.message || "Failed to load salary slips") : "";
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" });

  const handleNotify = (message, severity = "success") => {
    setSnackbar({ open: true, message, severity });
  };

  const handleCloseSnackbar = () => {
    setSnackbar((prev) => ({ ...prev, open: false }));
  };

  // `total` (server-reported count for the current month/search filter)
  // rather than rows.length - since rows is now just one page's worth,
  // rows.length === 0 is also true for "this page/search has no matches"
  // on a tenant that has plenty of slips overall, which must NOT trigger
  // the "no slips exist yet" empty state below.
  const hasRows = total > 0;

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

  const isDefaultMonth = !selectedMonth;

  if (!loading && !hasRows && !search && isDefaultMonth) {
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
        <SalarySlipTable
          rows={rows}
          onNotify={handleNotify}
          selectedMonth={selectedMonth}
          onMonthChange={setSelectedMonth}
          page={page}
          onPageChange={setPage}
          total={total}
          search={searchInput}
          onSearchChange={setSearchInput}
        />
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