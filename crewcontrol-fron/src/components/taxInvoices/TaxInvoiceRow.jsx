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
  Snackbar,
  Alert,
} from "@mui/material";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";
import DownloadIcon from '@mui/icons-material/Download';
import VisibilityIcon from '@mui/icons-material/Visibility';
import DeleteIcon from '@mui/icons-material/Delete';
import { invoicesApi } from "../../api/invoices";
import { useState } from "react";

export default function TaxInvoiceRow({ row }) {
  const [anchorEl, setAnchorEl] = useState(null);
  const open = Boolean(anchorEl);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  function handleOpen(e) {
    setAnchorEl(e.currentTarget);
  }

  function handleClose() {
    setAnchorEl(null);
  }

  function showSnackbar(message, severity = 'success') {
    setSnackbar({ open: true, message, severity });
  }

  function closeSnackbar() {
    setSnackbar({ ...snackbar, open: false });
  }

  async function handleView() {
    handleClose();
    try {
      const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:5000';
      const previewUrl = `${apiBase}/api/invoices/${row.id}/download?inline=1`;
      window.open(previewUrl, '_blank', 'noopener,noreferrer');
      showSnackbar('Opening invoice in new tab...', 'success');
    } catch (err) {
      console.error('Preview failed', err);
      showSnackbar('Failed to open preview', 'error');
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
      showSnackbar('Invoice downloaded successfully', 'success');
    } catch (err) {
      console.error('Download failed', err);
      showSnackbar('Failed to download', 'error');
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
      showSnackbar('Invoice deleted successfully', 'success');
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      console.error('Delete failed', err);
      showSnackbar('Failed to delete invoice', 'error');
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
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <PictureAsPdfOutlinedIcon
              sx={{ fontSize: 16, color: "#EF4444" }}
            />
            <Typography fontSize={13}>{row.timesheet}</Typography>
          </Box>
        </TableCell>

        <TableCell>{row.subtotal.toFixed(2)}</TableCell>
        <TableCell>{row.vat.toFixed(2)}</TableCell>
        <TableCell>{row.netAmount.toFixed(2)}</TableCell>

        <TableCell align="right">
          <IconButton size="small" onClick={handleOpen}>
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

      {/* Snackbar for Notifications */}
      <Snackbar 
        open={snackbar.open} 
        autoHideDuration={4000} 
        onClose={closeSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert 
          onClose={closeSnackbar} 
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
}
