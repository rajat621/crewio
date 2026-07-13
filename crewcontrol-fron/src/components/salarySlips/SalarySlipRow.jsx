import {
  TableRow,
  TableCell,
  IconButton,
  Box,
  Typography,
  Menu,
  MenuItem,
} from "@mui/material";
import { buildSlipPreviewHtml, generateSalarySlipPdf,} from "../../utils/salarySlipUtils";
import { salarySlipsApi } from '../../api/salarySlips'
import MoreVertIcon from "@mui/icons-material/MoreVert";
import VisibilityIcon from '@mui/icons-material/Visibility';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import { useState } from "react";
import { ACTION_CELL_SX, ACTION_ICON_BUTTON_SX } from "../table/tableUtils";
import { useNavigate } from "react-router-dom";
import DownloadIcon from "@mui/icons-material/Download";

// Guarantees a fully-shaped slip object for SalarySlipDocument / jsPDF,
// no matter what row.slipData actually contains. Falls back to flat
// row-level fields (row.employeeName, row.trade, etc.) for anything
// missing from slipData, since those are already known-good (they're
// what's rendered in the table cells).
function normalizeSlipData(raw = {}, row = {}) {
  const num = (v) => (typeof v === "number" && !Number.isNaN(v) ? v : Number(v) || 0);
  const str = (v, fallback = "") => (v === undefined || v === null ? fallback : String(v));

  const employeeSrc = raw.employee || {};

  return {
    companyName: str(raw.companyName, "Company name"),
    companyPhone: str(raw.companyPhone, "Company Phone no"),
    companyLogo: raw.companyLogo || null,
    payMonth: str(raw.payMonth, ""),
    payYear: str(raw.payYear, String(new Date().getFullYear())),
    employee: {
      name: str(employeeSrc.name, row.employeeName),
      emiratesId: str(employeeSrc.emiratesId, row.emiratesId),
      trade: str(employeeSrc.trade, row.trade),
      totalDaysWorked: employeeSrc.totalDaysWorked ?? row.totalDaysWorked ?? 0,
      totalHoursWorked: employeeSrc.totalHoursWorked ?? row.totalHoursWorked ?? 0,
    },
    earnings: {
      calculatedSalary: num(raw.earnings?.calculatedSalary),
      additionalAllowances: num(raw.earnings?.additionalAllowances ?? raw.additionalAllowances),
      grossSalary: num(raw.earnings?.grossSalary ?? raw.grossSalary),
    },
    deductionRows: Array.isArray(raw.deductionRows)
      ? raw.deductionRows.map((r) => ({ label: str(r.label), value: num(r.value) }))
      : [],
    totalDeduction: num(raw.totalDeduction),
    advance: {
      totalGiven: num(raw.advance?.totalGiven),
      thisMonthDeduction: num(raw.advance?.thisMonthDeduction ?? row.advance),
      remaining: num(raw.advance?.remaining ?? row.advance),
    },
    netSalary: num(raw.netSalary ?? row.netAmount),
  };
}

export default function SalarySlipRow({ row, onNotify }) {
  const [anchorEl, setAnchorEl] = useState(null);
  const open = Boolean(anchorEl);
  const navigate = useNavigate();

  function handleOpen(e) {
    setAnchorEl(e.currentTarget);
  }
  function handleClose() {
    setAnchorEl(null);
  }

  function handleViewProfile() {
    handleClose();
    if (row.employeeId) {
      navigate(`/employees/${row.employeeId}`);
    } else {
      onNotify?.('Employee profile not available', 'info');
    }
  }

  function handlePreviewSlip() {
    handleClose();
    if (!row.slipData) {
      onNotify?.('Full slip data not available', 'error');
      return;
    }

    const previewWindow = window.open('', '_blank');
    if (!previewWindow) {
      onNotify?.('Popup blocked. Please allow popups for this site and try again.', 'error');
      return;
    }
    try {
      const data = normalizeSlipData(row.slipData, row);
      previewWindow.document.open();
      previewWindow.document.write(buildSlipPreviewHtml(data));
      previewWindow.document.close();
    } catch (err) {
      console.error('Preview render failed', err);
      previewWindow.document.write('<p style="font-family:sans-serif;padding:24px;">Failed to render preview.</p>');
      previewWindow.document.close();
      onNotify?.('Failed to render preview', 'error');
    }
  }

  async function handleDownloadSlip() {
    handleClose();
    if (!row.slipData) {
      onNotify?.('Full slip data not available', 'error');
      return;
    }

    try {
      const data = normalizeSlipData(row.slipData, row);
      const blob = await generateSalarySlipPdf(data);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeName = (row.employeeName || 'salary-slip').trim().replace(/\s+/g, '_');
      a.download = `${safeName}_Salary_Slip_${data.payMonth || ''}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      onNotify?.('Salary slip downloaded', 'success');
    } catch (err) {
      console.error('Download failed', err);
      onNotify?.(err?.message || 'Failed to download', 'error');
    }
  }

  return (
    <TableRow hover>
      <TableCell>{row.invoiceNo}</TableCell>
      <TableCell>{row.employeeName}</TableCell>
      <TableCell>{row.trade}</TableCell>
      <TableCell>{row.invoiceDate}</TableCell>
      <TableCell>{row.rateHr.toFixed(1)}</TableCell>
      <TableCell>{row.advance.toFixed(2)}</TableCell>
      <TableCell>{row.netAmount.toFixed(2)}</TableCell>

      <TableCell align="center" sx={ACTION_CELL_SX}>
        <IconButton size="small" onClick={handleOpen} sx={ACTION_ICON_BUTTON_SX}>
          <MoreVertIcon fontSize="small" />
        </IconButton>
<Menu anchorEl={anchorEl} open={open} onClose={handleClose}>
  <MenuItem onClick={handleViewProfile}>
    <AccountCircleIcon sx={{ mr: 1 }} />
    View Profile
  </MenuItem>

  <MenuItem onClick={handlePreviewSlip}>
    <VisibilityIcon sx={{ mr: 1 }} />
    Preview Slip
  </MenuItem>

  <MenuItem onClick={handleDownloadSlip}>
    <DownloadIcon sx={{ mr: 1 }} />
    Download Slip
  </MenuItem>
</Menu>
      </TableCell>
    </TableRow>
  );
}