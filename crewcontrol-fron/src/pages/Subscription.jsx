import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import crewioLogo from "../assets/crewio_logo.png";
import { Box, Button, Typography, IconButton } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";

// Feature descriptions keyed by feature name. Anything not listed
// falls back to the default description.
const FEATURE_DESCRIPTIONS = {
  Tracking:
    "Usage limits apply. Prices shown don't include applicable tax. Prices and plans are subject to change at the company's discretion.",
  "Tax Invoice":
    "Track hours efficiently. All rates exclude taxes and may vary without notice.",
  "Salary Slip":
    "Track hours efficiently. All rates exclude taxes and may vary without notice.",
  Quotation:
    "Track hours efficiently. All rates exclude taxes and may vary without notice.",
  Chat: "Ensure compliance with labor laws. Pricing is estimate-based and subject to updates.",
};
const DEFAULT_FEATURE_DESCRIPTION =
  "Monitor budgets in real-time. Prices exclude taxes and are subject to change.";

const plans = [
  {
    name: "Crewio Plus",
    subtitle: "Manage you labor",
    oldPrice: 399,
    price: 249,
    current: true,
    features: ["Tracking", "Tax Invoice", "Chat", "App", "Total Worker 50", "Storage"],
  },
  {
    name: "Crewio Pro",
    subtitle: "Simplify scheduling",
    oldPrice: 799,
    price: 449,
    button: "Upgrade to Pro",
    features: [
      "Tracking",
      "Tax Invoice",
      "Salary Slip",
      "Quotation",
      "Chat",
      "App",
      "Finance",
      "AI",
      "Total Worker 100",
      "Storage",
    ],
  },
  {
    name: "Crewio Ultra",
    subtitle: "Advanced workforce solutions",
    oldPrice: 1899,
    price: 1199,
    button: "Upgrade to Ultra",
    features: [
      "Tracking",
      "Tax Invoice",
      "Salary Slip",
      "Quotation",
      "Chat",
      "App",
      "Finance",
      "AI",
      "Total Worker Unlimited",
      "Storage",
    ],
  },
];

export default function Subscription() {
  const [activeTab, setActiveTab] = useState("monthly");
  const navigate = useNavigate();

  return (
    <Box
      sx={{
        width: "100vw",
        height: "100vh",
        background: "#F7F5FF",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Fixed Header */}
      <Box
        sx={{
          height: "72px",
          minHeight: "72px",
          bgcolor: "#fff",
          borderBottom: "1px solid #E5E7EB",
          px: 3,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <Box
          component="img"
          src={crewioLogo}
          alt="Crewio"
          sx={{ height: 38, objectFit: "contain" }}
        />
        <IconButton onClick={() => navigate("/home")}>
          <CloseIcon />
        </IconButton>
      </Box>

      {/* Content area with 24/40 gap around the white container */}
      <Box sx={{ flex: 1, p: "24px 40px", overflow: "auto" }}>
        <Box
          sx={{
            width: "100%",
            bgcolor: "#fff",
            border: "1px solid #E5E7EB",
            borderRadius: "16px",
          }}
        >
          <Box
            sx={{
              px: 4,
              py: 5,
              "&::-webkit-scrollbar": { width: "8px" },
              "&::-webkit-scrollbar-thumb": {
                background: "#D1D5DB",
                borderRadius: "999px",
              },
            }}
          >
            <Typography
              align="center"
              sx={{ fontSize: 24, fontWeight: 600, color: "#141414", mb: 1 }}
            >
              Everything You Need to Manage Labor at Scale
            </Typography>

            <Typography
              align="center"
              sx={{ color: "#757575", fontSize: 14, maxWidth: 500, mx: "auto" }}
            >
              Upgrade to streamline attendance, payroll, invoicing,
              communication, and workforce tracking.
            </Typography>

            {/* Billing Toggle */}
            <Box sx={{ display: "flex", justifyContent: "center", mt: 4, mb: 6 }}>
              <Box
                sx={{
                  bgcolor: "#2554E8",
                  borderRadius: "999px",
                  p: "4px",
                  display: "flex",
                  alignItems: "center",
                  height: "40px",
                }}
              >
                {["monthly", "yearly"].map((tab) => (
                  <Box
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    sx={{
                      px: 4,
                      height: "32px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: "999px",
                      fontWeight: 600,
                      fontSize: 14,
                      cursor: "pointer",
                      bgcolor: activeTab === tab ? "#FFFFFF" : "transparent",
                      color: activeTab === tab ? "#2554E8" : "#FFFFFF",
                      transition: "all 0.2s ease",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {tab === "monthly" ? (
                      "Monthly"
                    ) : (
                      <>
                        Yearly{" "}
                        <Box
                          component="span"
                          sx={{ color: "#FBBF24", ml: 0.5, fontStyle: "italic" }}
                        >
                          Save 10%
                        </Box>
                      </>
                    )}
                  </Box>
                ))}
              </Box>
            </Box>

            {/* Plans */}
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "1fr",
                  md: "repeat(2, 1fr)",
                  lg: "repeat(3, 1fr)",
                },
                gap: 3,
              }}
            >
              {plans.map((plan) => (
                <Box
                  key={plan.name}
                  sx={{
                    border: "1px solid #E5E7EB",
                    borderRadius: "12px",
                    overflow: "hidden",
                    background: "#fff",
                  }}
                >
                  {/* Card Header */}
                  <Box
                    sx={{
                      background: "#F7F7FB",
                      p: 3,
                      borderBottom: "1px solid #E5E7EB",
                    }}
                  >
                    <Typography sx={{ fontWeight: 600, fontSize: 24, color: "#141414" }}>
                      {plan.name}
                    </Typography>

                    <Typography sx={{ color: "#757575", fontSize: 14, mt: 0.5 }}>
                      {plan.subtitle}
                    </Typography>

                    <Box
  sx={{
    mt: 4,
    display: "flex",
    alignItems: "flex-start",
    gap: 1,
  }}
>
  <Typography
    sx={{
      color: "#6B7280",
      fontSize: 40,
      textDecoration: "line-through",
      lineHeight: 1,
    }}
  >
    {plan.oldPrice}
  </Typography>

  <Typography
    sx={{
      fontSize: 40,
      fontWeight: 600,
      color: "#111827",
      lineHeight: 1,
    }}
  >
    {plan.price}
  </Typography>

  <Box
    sx={{
      display: "flex",
      flexDirection: "column",
      justifyContent: "flex-start",
      pt: "3px", // tweak if needed
    }}
  >
    <Typography sx={{ color: "#6B7280", fontSize: 13, lineHeight: 1.4 }}>
      AED/month
    </Typography>
    <Typography sx={{ color: "#6B7280", fontSize: 13, lineHeight: 1.4 }}>
      (including tax)
    </Typography>
  </Box>
</Box>

                    <Button
                      fullWidth
                      variant={plan.current ? "outlined" : "contained"}
                      sx={{
                        mt: 4,
                        height: 44,
                        borderRadius: "8px",
                        textTransform: "none",
                        fontWeight: 600,
                        backgroundColor: plan.current ? "transparent" : "#2554E8",
                        borderColor: "#D1D5DB",
                        color: plan.current ? "#6B7280" : "#fff",
                        "&:hover": {
                          backgroundColor: plan.current ? "#F9FAFB" : "#1E40C8",
                          borderColor: "#D1D5DB",
                        },
                      }}
                    >
                      {plan.current ? "Your Current Plan" : plan.button}
                    </Button>
                  </Box>

                  {/* Features */}
                  <Box sx={{ p: 3 }}>
                    {plan.features.map((feature) => (
                      <Box key={feature} sx={{ py: 1.5 }}>
                        <Box
                          sx={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <Typography sx={{ fontWeight: 500, fontSize: 14, color: "#141414" }}>
                            {feature}
                          </Typography>

                          <KeyboardArrowDownIcon sx={{ color: "#757575" }} />
                        </Box>

                        <Typography
                          sx={{ mt: 1, fontSize: 14, color: "#757575", lineHeight: 1.6 }}
                        >
                          {FEATURE_DESCRIPTIONS[feature] || DEFAULT_FEATURE_DESCRIPTION}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
