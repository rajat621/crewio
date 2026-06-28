import { Box, Dialog, DialogTitle, DialogContent, IconButton, Typography, Divider } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import AttachMoneyIcon from "@mui/icons-material/AttachMoney";

function ExpenseReportModal({ open, onClose, deductionBreakdown, advanceDeductions }) {
  const totalExpense = Object.values(deductionBreakdown).reduce((sum, val) => sum + val, 0);
  const totalAdvanceDeduction = advanceDeductions.reduce((sum, item) => sum + item.amount, 0);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: "12px",
          bgcolor: "var(--bg-surface)",
        },
      }}
    >
      <DialogTitle
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 16,
          fontWeight: 600,
          color: "var(--text-primary)",
        }}
      >
        Expense Report
        <IconButton size="small" onClick={onClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ maxHeight: "70vh", overflowY: "auto" }}>
        {/* Total Expense Amount */}
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mb: "24px",
            p: "16px",
            bgcolor: "var(--bg-light)",
            borderRadius: "8px",
          }}
        >
          <Box>
            <Typography sx={{ fontSize: 12, color: "var(--text-secondary)" }}>
              Total Expense Amount
            </Typography>
            <Typography sx={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>
              (Deductions)
            </Typography>
          </Box>
          <Typography sx={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)" }}>
            AED {totalExpense.toFixed(0)}
          </Typography>
        </Box>

        {/* Deduction Breakdown */}
        <Typography sx={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", mb: "12px" }}>
          Deductions
        </Typography>

        <Box sx={{ mb: "24px" }}>
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              mb: "12px",
              p: "12px",
              bgcolor: "var(--bg-light)",
              borderRadius: "8px",
            }}
          >
            <Box sx={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <AttachMoneyIcon sx={{ fontSize: 18, color: "var(--text-secondary)" }} />
              <Typography sx={{ fontSize: 12, color: "var(--text-primary)" }}>
                Penalty Amount
              </Typography>
            </Box>
            <Typography sx={{ fontSize: 12, fontWeight: 500, color: "var(--text-primary)" }}>
              AED {deductionBreakdown.penalty.toFixed(2)}
            </Typography>
          </Box>

          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              mb: "12px",
              p: "12px",
              bgcolor: "var(--bg-light)",
              borderRadius: "8px",
            }}
          >
            <Box sx={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <AttachMoneyIcon sx={{ fontSize: 18, color: "var(--text-secondary)" }} />
              <Typography sx={{ fontSize: 12, color: "var(--text-primary)" }}>
                Gas
              </Typography>
            </Box>
            <Typography sx={{ fontSize: 12, fontWeight: 500, color: "var(--text-primary)" }}>
              AED {deductionBreakdown.gas.toFixed(2)}
            </Typography>
          </Box>

          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              mb: "12px",
              p: "12px",
              bgcolor: "var(--bg-light)",
              borderRadius: "8px",
            }}
          >
            <Box sx={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <AttachMoneyIcon sx={{ fontSize: 18, color: "var(--text-secondary)" }} />
              <Typography sx={{ fontSize: 12, color: "var(--text-primary)" }}>
                Advance
              </Typography>
            </Box>
            <Typography sx={{ fontSize: 12, fontWeight: 500, color: "var(--text-primary)" }}>
              AED {deductionBreakdown.advance.toFixed(2)}
            </Typography>
          </Box>

          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              mb: "12px",
              p: "12px",
              bgcolor: "var(--bg-light)",
              borderRadius: "8px",
            }}
          >
            <Box sx={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <AttachMoneyIcon sx={{ fontSize: 18, color: "var(--text-secondary)" }} />
              <Typography sx={{ fontSize: 12, color: "var(--text-primary)" }}>
                Other (Food)
              </Typography>
            </Box>
            <Typography sx={{ fontSize: 12, fontWeight: 500, color: "var(--text-primary)" }}>
              AED {deductionBreakdown.other.toFixed(2)}
            </Typography>
          </Box>
        </Box>

        <Divider sx={{ my: "16px", borderColor: "var(--border-card)" }} />

        {/* Advance Deductions */}
        <Typography sx={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", mb: "12px" }}>
          Advance Deduction
        </Typography>

        <Box sx={{ mb: "16px" }}>
          {advanceDeductions.map((item, index) => (
            <Box
              key={index}
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                mb: "12px",
                p: "12px",
                bgcolor: "var(--bg-light)",
                borderRadius: "8px",
              }}
            >
              <Box>
                <Box sx={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <AttachMoneyIcon sx={{ fontSize: 18, color: "var(--text-secondary)" }} />
                  <Typography sx={{ fontSize: 12, fontWeight: 500, color: "var(--text-primary)" }}>
                    Advance Deduction
                  </Typography>
                </Box>
                <Typography sx={{ fontSize: 11, color: "var(--text-secondary)", mt: "4px" }}>
                  {item.date}
                </Typography>
              </Box>
              <Typography sx={{ fontSize: 12, fontWeight: 500, color: "var(--text-primary)" }}>
                AED {item.amount.toFixed(2)}
              </Typography>
            </Box>
          ))}
        </Box>

        <Divider sx={{ my: "16px", borderColor: "var(--border-card)" }} />

        {/* Remain Amount */}
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            p: "16px",
            bgcolor: "var(--bg-light)",
            borderRadius: "8px",
          }}
        >
          <Typography sx={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)" }}>
            Remain Amount
          </Typography>
          <Typography sx={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>
            AED {(totalExpense + totalAdvanceDeduction).toFixed(2)}
          </Typography>
        </Box>
      </DialogContent>
    </Dialog>
  );
}

export default ExpenseReportModal;