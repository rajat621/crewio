import {
  TableRow,
  TableCell,
  IconButton,
  Box,
  Typography,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  Tooltip,
} from "@mui/material";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";
import DownloadIcon from '@mui/icons-material/Download';
import VisibilityIcon from '@mui/icons-material/Visibility';
import DeleteIcon from '@mui/icons-material/Delete';
import { invoicesApi } from "../../api/invoices";
import { useState } from "react";
import { ACTION_CELL_SX, ACTION_ICON_BUTTON_SX } from "../table/tableUtils";

export default function TaxInvoiceRow({ row, onDeleteSuccess, onNotify }) {
  const [anchorEl, setAnchorEl] = useState(null);
  const open = Boolean(anchorEl);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  function handleOpen(e) {
    setAnchorEl(e.currentTarget);
  }

  function handleClose() {
    setAnchorEl(null);
  }

  function notify(message, severity = 'success') {
    onNotify?.(message, severity);
  }

  async function handleView() {
    handleClose();
    const previewWindow = window.open('', '_blank');
    const canOpenNewTab = Boolean(previewWindow);

    if (!canOpenNewTab) {
      notify('Popup blocked. Please allow popups and try again.', 'error');
      return;
    }

    try {
      previewWindow.opener = null;
    } catch (error) {
      // Ignore if browser disallows setting opener.
    }

    previewWindow.document.title = 'Loading invoice...';
    previewWindow.document.body.innerHTML = '<p style="font-family: Arial, sans-serif; padding: 16px;">Loading invoice preview...</p>';

    try {
      const resp = await invoicesApi.downloadInvoice(row.id);
      const blob = new Blob([resp.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);

      previewWindow.location.href = url;

      // Keep the blob alive long enough for the new tab to load it.
      setTimeout(() => {
        window.URL.revokeObjectURL(url);
      }, 60000);

      notify('Opening invoice in new tab...', 'success');
    } catch (err) {
      previewWindow.close();
      console.error('Preview failed', err);
      notify('Failed to open preview', 'error');
    }
  }

  async function handleDownload() {
    handleClose();
    try {
      const resp = await invoicesApi.downloadInvoice(row.id);
      const blob = new Blob([resp.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${row.invoiceNo || 'invoice'}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      notify('Invoice downloaded successfully', 'success');
    } catch (err) {
      console.error('Download failed', err);
      notify('Failed to download', 'error');
    }
  }

  function handleDeleteClick() {
    handleClose();
    setDeleteDialogOpen(true);
  }

  async function handleDeleteConfirm() {
    setDeleteDialogOpen(false);
    try {
      await invoicesApi.deleteInvoice(row.id);
      if (typeof onDeleteSuccess === "function") {
        onDeleteSuccess(row.id);
      }
      notify('Invoice deleted successfully', 'success');
    } catch (err) {
      console.error('Delete failed', err);
      notify('Failed to delete invoice', 'error');
    }
  }

  function handleDeleteCancel() {
    setDeleteDialogOpen(false);
  }

  return (
    <>
      <TableRow hover>
        <TableCell>{row.invoiceNo}</TableCell>
        <TableCell>{row.company}</TableCell>
        <TableCell>{row.invoiceDate}</TableCell>

        <TableCell>
          <Tooltip title={row.timesheetFull || row.timesheet} arrow>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, maxWidth: 220 }}>
              <PictureAsPdfOutlinedIcon
                sx={{ fontSize: 16, color: "var(--color-error)", flexShrink: 0 }}
              />
              <Typography
                fontSize={13}
                sx={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {row.timesheet}
              </Typography>
            </Box>
          </Tooltip>
        </TableCell>

        <TableCell>{row.subtotal.toFixed(2)}</TableCell>
        <TableCell>{row.vat.toFixed(2)}</TableCell>
        <TableCell>{row.netAmount.toFixed(2)}</TableCell>

        <TableCell align="center" sx={ACTION_CELL_SX}>
          <IconButton size="small" onClick={handleOpen} sx={ACTION_ICON_BUTTON_SX}>
            <MoreVertIcon fontSize="small" />
          </IconButton>
          <Menu anchorEl={anchorEl} open={open} onClose={handleClose}>
            <MenuItem onClick={handleView}><VisibilityIcon sx={{mr:1}}/>View</MenuItem>
            <MenuItem onClick={handleDownload}><DownloadIcon sx={{mr:1}}/>Download</MenuItem>
            <MenuItem onClick={handleDeleteClick}><DeleteIcon sx={{mr:1}}/>Delete</MenuItem>
          </Menu>
        </TableCell>
      </TableRow>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={handleDeleteCancel}
        aria-labelledby="delete-dialog-title"
        aria-describedby="delete-dialog-description"
      >
        <DialogTitle id="delete-dialog-title" sx={{ fontWeight: 600 }}>
          Delete Invoice
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="delete-dialog-description">
            Are you sure you want to delete this invoice? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteCancel} variant="outlined">
            Cancel
          </Button>
          <Button 
            onClick={handleDeleteConfirm} 
            variant="contained" 
            color="error"
            sx={{ textTransform: 'none' }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}