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
import MoreVertIcon from "@mui/icons-material/MoreVert";
import VisibilityIcon from '@mui/icons-material/Visibility';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import { useState } from "react";
import { ACTION_CELL_SX, ACTION_ICON_BUTTON_SX } from "../table/tableUtils";
import { useNavigate } from "react-router-dom";
import DownloadIcon from "@mui/icons-material/Download";

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
    onNotify?.(
      "Full slip data not available",
      "error"
    );
    return;
  }

  const w = window.open("", "_blank");

  if (!w) {
    onNotify?.(
      "Popup blocked. Please allow popups.",
      "error"
    );
    return;
  }

  w.document.open();
  w.document.write(
    buildSlipPreviewHtml(
      row.slipData
    )
  );
  w.document.close();
}
function handleDownloadSlip() {
  handleClose();

  if (!row.slipData) {
    onNotify?.(
      "Full slip data not available",
      "error"
    );
    return;
  }

  const pdf =
    generateSalarySlipPdf(
      row.slipData
    );

  const safeName =
    (row.employeeName || "salary-slip")
      .replace(/\s+/g, "_");

  pdf.save(
    `${safeName}_Salary_Slip.pdf`
  );
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
