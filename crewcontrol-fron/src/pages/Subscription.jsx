import { Box, Button, Chip, Divider, Typography } from "@mui/material";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";

function Subscription() {
  return (
    <Box
      sx={{
        flex: 1,
        minHeight: "100vh",
        backgroundColor: "#F7F5FF",
        px: "40px",
        py: "24px",
      }}
    >
      <Box
        sx={{
          backgroundColor: "#FFFFFF",
          border: "1px solid #E5E7EB",
          borderRadius: "10px",
          p: "24px",
        }}
      >
        <Typography sx={{ fontSize: "18px", fontWeight: 600, color: "#111827", mb: "6px" }}>
          Your Subscription
        </Typography>
        <Typography sx={{ fontSize: "14px", color: "#6B7280", mb: "20px" }}>
          Plan and billing details are shown below. You can redesign this page later.
        </Typography>

        <Box
          sx={{
            border: "1px solid #E5E7EB",
            borderRadius: "10px",
            p: "20px",
            mb: "16px",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: "12px" }}>
            <Typography sx={{ fontSize: "16px", fontWeight: 600, color: "#141414" }}>
              Pro Plan
            </Typography>
            <Chip
              label="Active"
              size="small"
              sx={{
                backgroundColor: "#ECFDF3",
                color: "#027A48",
                border: "1px solid #ABEFC6",
                fontWeight: 500,
                borderRadius: "999px",
              }}
            />
          </Box>

          <Typography sx={{ fontSize: "14px", color: "#4B5563", mb: "10px" }}>
            Includes team management, company setup, invoices, attendance, and support tools.
          </Typography>

          <Divider sx={{ my: "12px" }} />

          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", rowGap: "10px" }}>
            <Typography sx={{ fontSize: "14px", color: "#6B7280" }}>Billing cycle</Typography>
            <Typography sx={{ fontSize: "14px", color: "#111827", fontWeight: 500 }}>Monthly</Typography>

            <Typography sx={{ fontSize: "14px", color: "#6B7280" }}>Next renewal</Typography>
            <Typography sx={{ fontSize: "14px", color: "#111827", fontWeight: 500 }}>May 20, 2026</Typography>

            <Typography sx={{ fontSize: "14px", color: "#6B7280" }}>Amount</Typography>
            <Typography sx={{ fontSize: "14px", color: "#111827", fontWeight: 500 }}>$29.00</Typography>
          </Box>
        </Box>

        <Box sx={{ display: "flex", gap: "12px" }}>
          <Button
            variant="contained"
            endIcon={<ArrowForwardRoundedIcon />}
            sx={{
              textTransform: "none",
              borderRadius: "8px",
              height: "32px",
              minHeight: "32px",
              px: "16px",
              backgroundColor: "#1D4ED8",
              "&:hover": { backgroundColor: "#1E40AF" },
            }}
          >
            Manage Plan
          </Button>

          <Button
            variant="outlined"
            sx={{
              textTransform: "none",
              borderRadius: "8px",
              height: "32px",
              minHeight: "32px",
              px: "16px",
              borderColor: "#D1D5DB",
              color: "#4B5563",
            }}
          >
            Download Invoice
          </Button>
        </Box>
      </Box>
    </Box>
  );
}

export default Subscription;
