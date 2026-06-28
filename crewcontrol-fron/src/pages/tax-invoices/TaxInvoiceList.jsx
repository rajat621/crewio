import { Box, Button, Snackbar, Alert } from "@mui/material";
import { useEffect, useState } from "react";
import AddIcon from "@mui/icons-material/Add";
import { useNavigate } from "react-router-dom";

import TaxInvoiceTable from "../../components/taxInvoices/TaxInvoiceTable";
import NoDataOverlay from "../../components/common/NoDataOverlay";
import { invoicesApi } from "../../api/invoices";

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
  return parts[parts.length - 1] || "-";
};

const mapInvoiceToRow = (invoice) => ({
  id: invoice?._id,
  invoiceNo: invoice?.invoiceNumber || "-",
  company:
    (typeof invoice?.companyId === "object" ? invoice?.companyId?.name : null) ||
    invoice?.clientName ||
    "-",
  invoiceDate: formatDate(invoice?.invoiceDate),
  timesheet: getFileName(invoice?.timesheetPath || invoice?.filePath || invoice?.pdfUrl),
  subtotal: Number(invoice?.subtotal || 0),
  vat: Number(invoice?.vatAmount || invoice?.tax || 0),
  netAmount: Number(invoice?.total || 0),
});

function TaxInvoiceList() {
  const navigate = useNavigate();
  const [invoiceRows, setInvoiceRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" });

  const handleNotify = (message, severity = "success") => {
    setSnackbar({ open: true, message, severity });
  };

  const handleCloseSnackbar = () => {
    setSnackbar((prev) => ({ ...prev, open: false }));
  };

  const handleDeleteSuccess = (invoiceId) => {
    setInvoiceRows((prevRows) => prevRows.filter((row) => row.id !== invoiceId));
  };

  useEffect(() => {
    let active = true;

    const loadInvoices = async () => {
      try {
        setLoading(true);
        const response = await invoicesApi.getInvoices();
        const invoices = Array.isArray(response?.data)
          ? response.data
          : Array.isArray(response?.data?.data)
            ? response.data.data
            : [];
        if (active) {
          setInvoiceRows(invoices.map(mapInvoiceToRow));
        }
      } catch (error) {
        if (active) {
          setInvoiceRows([]);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadInvoices();

    return () => {
      active = false;
    };
  }, []);

  const hasInvoices = invoiceRows.length > 0;

  if (!loading && !hasInvoices) {
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
        <TaxInvoiceTable rows={invoiceRows} onDeleteSuccess={handleDeleteSuccess} onNotify={handleNotify} />
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

