// components/alerts/VatTaxAlert.jsx
//
// The "Tax to pay" Smart Alert - this section itself is always visible in
// Smart Alerts (same as Daily Workforce Status / Document Status), whether
// or not there's currently anything to pay. Only the notification badge
// and the collapsed body content depend on whether a VAT period is
// actually active right now (registration month set + today falls in a
// filing month + not already marked paid).
//
// Reuses the existing AlertAccordion shell (arrow, title, badge, Collapse)
// via its children prop instead of duplicating that markup - this file
// only owns the VAT-specific content.
import { useState } from "react";
import { Box, Typography, Button, CircularProgress, Dialog, IconButton } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import AlertAccordion from "./AlertAccordion";

const formatAed = (value) => `${Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })} AED`;

function VatTaxAlert({ vatSummary, isOpen, onToggle, onMarkPaid, isMarkingPaid, markPaidError }) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const isActive = Boolean(vatSummary?.active);
  const { deadlineMonthName, deadlineYear, breakdown = [], total = 0 } = vatSummary || {};

  return (
    <AlertAccordion
      title="Tax to pay"
      // One VAT payment is one notification, regardless of how many
      // months its breakdown covers - not the row count.
      count={isActive ? 1 : 0}
      isOpen={isOpen}
      onToggle={onToggle}
    >
      {isActive ? (
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
          <Typography sx={{ fontSize: 12, color: "#27243A" }}>
            Total VAT Amount to pay{" "}
            <Box component="span" sx={{ color: "#2454D9", fontWeight: 700 }}>
              {Math.round(total)}
            </Box>{" "}
            AED
          </Typography>
          <Button
            variant="outlined"
            onClick={() => setShowBreakdown(true)}
            sx={{
              textTransform: "none",
              borderRadius: "8px",
              fontWeight: 600,
              maxWidth: 80,
              height:32,
              flexShrink: 0,
            }}
          >
            View
          </Button>
        </Box>
      ) : (
        <Typography sx={{ fontSize: 14, color: "#57517E" }}>No VAT payment currently due.</Typography>
      )}

      <Dialog
        open={showBreakdown}
        onClose={() => setShowBreakdown(false)}
        maxWidth="xs"
        fullWidth
      >
        <Box sx={{ p: "24px" }}>
          <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", mb: "4px" }}>
            <Box>
              <Typography sx={{ fontSize: 16, fontWeight: 700, color: "#27243A" }}>Tax to pay</Typography>
              <Typography sx={{ fontSize: 12, color: "#57517E", mt: "2px" }}>
                {deadlineMonthName} {deadlineYear} filing period
              </Typography>
            </Box>
            <IconButton onClick={() => setShowBreakdown(false)} size="small" sx={{ mt: "-6px", mr: "-6px" }}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>

          <Box sx={{ display: "flex", flexDirection: "column", gap: "6px", mt: "16px" }}>
            {breakdown.map((row, index) => (
              <Box
                key={`${row.month}-${row.year}-${index}`}
                sx={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 60px",
                  gap: "8px",
                  fontSize: 13,
                  color: "#27243A",
                }}
              >
                <Typography sx={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={row.companyName}>
                  {row.companyName}
                </Typography>
                <Typography sx={{ fontSize: 13, color: "#57517E" }}>
                  {row.month} {row.year}
                </Typography>
                <Typography sx={{ fontSize: 13, textAlign: "right", fontWeight: 600 }}>
                  {formatAed(row.vatAmount)}
                </Typography>
              </Box>
            ))}
          </Box>

          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              pt: "8px",
              mt: "10px",
              borderTop: "1px solid #E4E2ED",
            }}
          >
            <Typography sx={{ fontSize: 13, fontWeight: 700, color: "#27243A" }}>Total</Typography>
            <Typography sx={{ fontSize: 13, fontWeight: 700, color: "#2454D9" }}>{formatAed(total)}</Typography>
          </Box>

          {markPaidError ? (
            <Typography sx={{ fontSize: 12, color: "#B91C1C", mt: "10px" }}>{markPaidError}</Typography>
          ) : null}

          <Button
            variant="contained"
            fullWidth
            onClick={async () => {
              await onMarkPaid?.();
              setShowBreakdown(false);
            }}
            disabled={isMarkingPaid}
            sx={{ textTransform: "none", borderRadius: "8px", fontWeight: 600, mt: "16px" }}
          >
            {isMarkingPaid ? <CircularProgress size={18} color="inherit" /> : "Mark as Paid"}
          </Button>
        </Box>
      </Dialog>
    </AlertAccordion>
  );
}

export default VatTaxAlert;
