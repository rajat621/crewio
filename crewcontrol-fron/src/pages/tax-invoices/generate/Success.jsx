import {
  Box,
  Button,
  Divider,
  Typography,
} from "@mui/material";
import { useNavigate } from "react-router-dom";

function Success({ draft }) {
  const navigate = useNavigate();
  const { companySnapshot, invoiceDetails } = draft;

  return (
    <Box maxWidth={700}>
      {/* HEADER */}
      <Typography variant="h5" fontWeight={600} mb={1}>
        Tax Invoice Generated Successfully
      </Typography>

      <Typography color="text.secondary" mb={4}>
        Your tax invoice has been generated and is ready for use.
      </Typography>

      <Divider sx={{ mb: 3 }} />

      {/* SUMMARY */}
      <Box mb={4}>
        <Typography fontWeight={500} mb={1}>
          Company
        </Typography>
        <Typography>{companySnapshot?.name}</Typography>

        <Typography mt={2} fontWeight={500} mb={1}>
          Invoice Date
        </Typography>
        <Typography>
          {invoiceDetails?.invoiceDate}
        </Typography>

        <Typography mt={2} fontWeight={500} mb={1}>
          VAT Rate
        </Typography>
        <Typography>{invoiceDetails?.vatRate}%</Typography>

        {invoiceDetails?.timesheetFile && (
          <>
            <Typography mt={2} fontWeight={500} mb={1}>
              Timesheet
            </Typography>
            <Typography>
              {invoiceDetails.timesheetFile.name}
            </Typography>
          </>
        )}
      </Box>

      <Divider sx={{ mb: 4 }} />

      {/* ACTIONS */}
      <Box display="flex" gap={2}>
        <Button
          variant="contained"
          onClick={() => {
            // placeholder – will wire real download later
            alert("Download will be implemented next");
          }}
        >
          Download Invoice
        </Button>

        <Button
          variant="outlined"
          onClick={() => navigate("/tax-invoices")}
        >
          Back to Tax Invoices
        </Button>
      </Box>
    </Box>
  );
}

export default Success;
