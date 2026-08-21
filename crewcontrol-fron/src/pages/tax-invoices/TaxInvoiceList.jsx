import { Box, Button, Snackbar, Alert } from "@mui/material";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import AddIcon from "@mui/icons-material/Add";
import { useNavigate, useSearchParams } from "react-router-dom";

import TaxInvoiceTable from "../../components/taxInvoices/TaxInvoiceTable";
import NoDataOverlay from "../../components/common/NoDataOverlay";

import { useTaxInvoices } from "../../hooks/useTaxInvoices";
import { queryKeys } from "../../queryKeys";

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

const getFileName = (pathValue) => {
  if (!pathValue || typeof pathValue !== "string") return "-";
  const parts = pathValue.split(/[\\/]/);
  const rawName = parts[parts.length - 1];
  if (!rawName) return "-";

  // Uploaded timesheets are stored as "<upload-timestamp>-<original name>"
  // (see multer config) and sometimes carry extra artifacts from the
  // OCR/watermark-removal pipeline (doubled underscores, a trailing
  // "_removed"). None of that is meaningful to a person looking at the
  // invoice list, so strip it down to just the original file's name.
  const withoutTimestamp = rawName.replace(/^\d+-/, "");
  const dotIndex = withoutTimestamp.lastIndexOf(".");
  const base = dotIndex > 0 ? withoutTimestamp.slice(0, dotIndex) : withoutTimestamp;
  const ext = dotIndex > 0 ? withoutTimestamp.slice(dotIndex) : "";

  const cleanedBase = base
    .replace(/_removed$/i, "")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");

  return `${cleanedBase || base}${ext}` || "-";
};

// Keeps the extension always visible (so it's still obviously a PDF) and
// caps the rest so one long filename never stretches the table row -
// "Invoice_8__1__removed.pdf" style names could otherwise push the
// Subtotal/VAT/Net columns around, which is what looked inconsistent.
const truncateFileName = (name, maxBaseLength = 18) => {
  if (!name || name === "-") return name;
  const dotIndex = name.lastIndexOf(".");
  const base = dotIndex > 0 ? name.slice(0, dotIndex) : name;
  const ext = dotIndex > 0 ? name.slice(dotIndex) : "";
  if (base.length <= maxBaseLength) return name;
  return `${base.slice(0, maxBaseLength)}....${ext}`;
};

const mapInvoiceToRow = (invoice) => {
  const cleanedTimesheetName = getFileName(
    invoice?.source_timesheet_pdf || invoice?.timesheetPath || invoice?.filePath
  );

  return {
    id: invoice?._id,
    invoiceNo: invoice?.invoiceNumber || "-",
    company:
      (typeof invoice?.companyId === "object" ? invoice?.companyId?.name : null) ||
      invoice?.clientName ||
      "-",
    invoiceDate: formatDate(invoice?.invoiceDate),
    timesheet: truncateFileName(cleanedTimesheetName),
    timesheetFull: cleanedTimesheetName,
    subtotal: Number(invoice?.subtotal || 0),
    vat: Math.max(0, Number(invoice?.vatAmount ?? invoice?.total_vat ?? invoice?.vat ?? 0)),
    netAmount: Number(invoice?.total || 0),
  };
};

function TaxInvoiceList() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedMonth = searchParams.get("month") || "";
  const setSelectedMonth = (value) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("month", value);
      return next;
    });
  };

  const queryClient = useQueryClient();
  const { data: rawInvoices = [], isLoading: loading } = useTaxInvoices(selectedMonth);
  const invoiceRows = useMemo(() => rawInvoices.map(mapInvoiceToRow), [rawInvoices]);
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" });

  const handleNotify = (message, severity = "success") => {
    setSnackbar({ open: true, message, severity });
  };

  const handleCloseSnackbar = () => {
    setSnackbar((prev) => ({ ...prev, open: false }));
  };

  // TaxInvoiceTable performs the delete itself and calls this after -
  // patches the cache directly instead of the original's local
  // setInvoiceRows filter, so the shared query stays correct for any
  // other consumer instead of just this component's local copy.
  const handleDeleteSuccess = (invoiceId) => {
    queryClient.setQueryData(queryKeys.invoices.list({ month: selectedMonth }), (prev) =>
      Array.isArray(prev) ? prev.filter((invoice) => invoice._id !== invoiceId) : prev
    );
  };

  const hasInvoices = invoiceRows.length > 0;

  const isDefaultMonth = !selectedMonth;

  if (!loading && !hasInvoices && isDefaultMonth) {
    return (
      <NoDataOverlay
        title="No tax invoices yet"
        description="Generate your first tax invoice to start tracking payments."
        actionLabel="Generate Tax Invoice"
        onCancel={() => navigate("/")}
        onAction={() => navigate("/tax-invoices/generate")}
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
          onClick={() => navigate("/tax-invoices/generate")}
        >
          Generate Tax Invoice
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
        <TaxInvoiceTable
          rows={invoiceRows}
          onDeleteSuccess={handleDeleteSuccess}
          onNotify={handleNotify}
          selectedMonth={selectedMonth}
          onMonthChange={setSelectedMonth}
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

export default TaxInvoiceList;