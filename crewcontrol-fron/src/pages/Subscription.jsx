import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import crewioLogo from "../assets/crewio_logo.svg";
import { Box, Button, Typography, IconButton, Collapse } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";

// Each plan is a list of categories. Each category has a name and a list
// of sub-features (title + description). Categories with no items still
// render as a header row (used for Pro/Ultra, which are "Coming Soon").
const plans = [
  {
    key: "plus",
    name: "Crewio Plus",
    subtitle: "Manage you labor",
    oldPrice: 299,
    price: 199,
    current: true,
    categories: [
      {
        name: "Workforce Management",
        items: [
          {
            title: "Employee Management",
            description:
              "Manage employee profiles, documents, and work information from one secure place.",
          },
          {
            title: "Real-Time Attendance Tracking",
            description:
              "Manage employee profiles, documents, and work information from one secure place.",
          },
          {
            title: "Mobile Workforce App",
            description:
              "Allow employees to mark attendance, access documents, and receive company updates from anywhere.",
          },
          {
            title: "Employee Document Management",
            description:
              "Securely store and manage passports, visas, Emirates IDs, and other employee documents.",
          },
          {
            title: "Document Expiry Alerts",
            description:
              "Receive automatic reminders before important employee documents expire.",
          },
        ],
      },
      {
        name: "Payroll & Finance",
        items: [
          {
            title: "Manual Salary Slip Generator",
            description:
              "Generate salary slips manually using employee attendance and payroll data.",
          },
          {
            title: "AI VAT Invoice Generator",
            description:
              "Create professional VAT-compliant invoices in just a few clicks.",
          },
          {
            title: "Finance Dashboard",
            description:
              "Monitor payroll, invoices, expenses, and business performance in one place.",
          },
        ],
      },
      {
        name: "Reports",
        items: [
          {
            title: "Attendance Reports",
            description: "View attendance summaries for employees and projects.",
          },
          {
            title: "Payroll Reports",
            description: "Track payroll history and salary records.",
          },
          {
            title: "Financial Reports",
            description: "Monitor business expenses and invoice summaries.",
          },
        ],
      },
      {
        name: "Communication",
        items: [
          {
            title: "Team Chat",
            description: "Keep managers and employees connected with built-in messaging.",
          },
          {
            title: "Push Notifications",
            description: "Send important announcements to your workforce instantly.",
          },
        ],
      },
      {
        name: "Security",
        items: [
          {
            title: "Secure Cloud Storage",
            description:
              "Store company files and employee documents safely with encrypted cloud storage.",
          },
          {
            title: "Enterprise-Grade Security",
            description:
              "Protect your business data with secure authentication and encrypted storage.",
          },
          {
            title: "Automatic Data Backup",
            description:
              "Your business data is backed up automatically to reduce the risk of data loss.",
          },
        ],
      },
      {
        name: "Plan Limits",
        items: [
          {
            title: "100 Workers",
            description:
              "Perfect for small and growing workforce businesses with up to 100 employees.",
          },
          {
            title: "4 GB Storage",
            description: "Store employee records, invoices, and company documents.",
          },
        ],
      },
    ],
  },
  {
    key: "pro",
    name: "Crewio Pro",
    subtitle: "Simplify scheduling",
    comingSoon: true,
    categories: [
      { name: "Workforce Management", items: [] },
      { name: "Payroll & Finance", items: [] },
      { name: "AI Assistant", items: [] },
      { name: "Reports", items: [] },
      { name: "Communication", items: [] },
      { name: "Security", items: [] },
      { name: "Plan Limits", items: [] },
    ],
  },
  {
    key: "ultra",
    name: "Crewio Ultra",
    subtitle: "Advanced workforce solutions",
    comingSoon: true,
    categories: [
      { name: "Crewio AI Copilot", items: [] },
      { name: "Workforce Management", items: [] },
      { name: "Autonomous AI Automation", items: [] },
      { name: "Enterprise Features", items: [] },
      { name: "Enterprise Analytics", items: [] },
      { name: "Enterprise Support", items: [] },
      { name: "Security", items: [] },
      { name: "Plan Limits", items: [] },
    ],
  },
];

export default function Subscription() {
  const [activeTab, setActiveTab] = useState("monthly");
  const [expanded, setExpanded] = useState(() => {
    // Default: current plan's categories start expanded, everything else collapsed.
    const initial = {};
  plans.forEach((plan) => {
    plan.categories.forEach((category) => {
      initial[`${plan.key}-${category.name}`] = false;
    });
    });
    return initial;
  });
  const navigate = useNavigate();

  const toggleCategory = (planKey, categoryName) => {
    const key = `${planKey}-${categoryName}`;
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

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
            borderRadius: "8px",
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
                alignItems: "start",
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
    opacity: plan.comingSoon ? 0.6 : 1,
    pointerEvents: plan.comingSoon ? "none" : "auto",
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
                      {plan.comingSoon ? (
                        <Typography
                          sx={{ fontSize: 40, fontWeight: 600, color: "#111827", lineHeight: 1 }}
                        >
                          —
                        </Typography>
                      ) : (
                        <>
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
                        </>
                      )}

                      <Box
                        sx={{
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "flex-start",
                          pt: "3px",
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
                      disabled={plan.comingSoon}
                      variant={plan.current ? "outlined" : "contained"}
                      sx={{
                        mt: 4,
                        height: 44,
                        borderRadius: "8px",
                        textTransform: "none",
                        fontWeight: 600,
                        backgroundColor: plan.comingSoon
                          ? "#93A6F0"
                          : plan.current
                          ? "transparent"
                          : "#2554E8",
                        borderColor: "#D1D5DB",
                        color: plan.current ? "#6B7280" : "#fff",
                        "&.Mui-disabled": {
                          backgroundColor: "#93A6F0",
                          color: "#fff",
                        },
                        "&:hover": {
                          backgroundColor: plan.current ? "#F9FAFB" : "#1E40C8",
                          borderColor: "#D1D5DB",
                        },
                      }}
                    >
                      {plan.comingSoon
                        ? "Coming Soon"
                        : plan.current
                        ? "Your Current Plan"
                        : `Upgrade to ${plan.name.replace("Crewio ", "")}`}
                    </Button>
                  </Box>

                  {/* Categories */}
                  <Box sx={{ p: 3 }}>
                    {plan.categories.map((category) => {
                      const key = `${plan.key}-${category.name}`;
                      const isOpen = !!expanded[key];
                      const hasItems = category.items.length > 0;

                      return (
                        <Box key={category.name} sx={{ py: 1.5 }}>
                      <Box
                        onClick={() => hasItems && toggleCategory(plan.key, category.name)}
                        sx={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          cursor: hasItems ? "pointer" : "default",
                        }}
                      >
                            <Typography
                              sx={{ fontWeight: 600, fontSize: 15, color: "#141414" }}
                            >
                              {category.name}
                            </Typography>

                            <KeyboardArrowDownIcon
                              sx={{
                                color: "#757575",
                                transition: "transform 0.2s ease",
                                transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                              }}
                            />
                          </Box>

                          {hasItems && (
                            <Collapse in={isOpen} timeout={200}>
                              <Box sx={{ mt: 1.5, display: "flex", flexDirection: "column", gap: 1.5 }}>
                                {category.items.map((item) => (
                                  <Box key={item.title}>
                                    <Typography
                                      sx={{ fontWeight: 500, fontSize: 14, color: "#141414" }}
                                    >
                                      {item.title}
                                    </Typography>
                                    <Typography
                                      sx={{ mt: 0.5, fontSize: 14, color: "#757575", lineHeight: 1.6 }}
                                    >
                                      {item.description}
                                    </Typography>
                                  </Box>
                                ))}
                              </Box>
                            </Collapse>
                          )}
                        </Box>
                      );
                    })}
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