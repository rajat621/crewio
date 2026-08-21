import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import crewioLogo from "../assets/crewio_logo.svg";
import { useAuth } from "../context/AuthContext";
import { useBillingStatus } from "../hooks/useBillingStatus";
import { useManageBillingMutation } from "../hooks/mutations/useAccountSecurityMutations";
import { useCreateCheckoutSessionMutation } from "../hooks/mutations/useSubscriptionMutations";
import {
  Box,
  Button,
  Typography,
  IconButton,
  Collapse,
  CircularProgress,
  Snackbar,
  Alert,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";

// ---------------------------------------------------------------------------
// Stripe checkout
// ---------------------------------------------------------------------------
// The Checkout Session is created on the backend (which owns the Stripe
// secret key + Price IDs via src/config/plans.js) and simply returns a
// hosted URL to redirect the browser to. No Stripe.js/publishable key is
// needed on this page anymore. Moved into handleUpgrade below (as
// useCreateCheckoutSessionMutation) since hooks can only be called from
// inside a component, not a module-level function like this used to be.
//
// openBillingPortal (the other module-level function that used to live
// here) was confirmed dead - never called anywhere in this file or
// imported anywhere else - and removed rather than migrated.

// ---------------------------------------------------------------------------
// Pricing configuration — single source of truth for all displayed numbers.
// Add a `pricing` object to any plan to make it billable; plans without one
// (Pro/Ultra) keep rendering as "Coming Soon" exactly as before.
// ---------------------------------------------------------------------------
const PRICING = {
  monthly: {
    oldPrice: 299,
    price: 199,
    savePercent: 33,
    unitLabel: "AED/month",
  },
  yearly: {
    oldPrice: 3588,
    price: 2268,
    monthlyEquivalent: 189,
    savePercent: 37,
    unitLabel: "AED/year",
  },
};

const YEARLY_TOGGLE_LABEL = `Save ${PRICING.yearly.savePercent}%`;

// Each plan is a list of categories. Each category has a name and a list
// of sub-features (title + description). Categories with no items still
// render as a header row (used for Pro/Ultra, which are "Coming Soon").
const plans = [
  {
    key: "plus",
    name: "Crewio Plus",
    subtitle: "Manage you labor",
    pricing: PRICING,
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

// Small, subtle "Save X%" chip used under the price. Kept as its own
// component so it stays visually consistent everywhere it's used.
function SaveBadge({ percent }) {
  if (!percent) return null;
  return (
    <Box
      component="span"
      sx={{
        display: "inline-block",
        mt: 1,
        px: 1.25,
        py: 0.25,
        borderRadius: "999px",
        fontSize: 12,
        fontWeight: 600,
        color: "#059669",
        bgcolor: "#ECFDF5",
        border: "1px solid #A7F3D0",
      }}
    >
      Save {percent}%
    </Box>
  );
}

export default function Subscription() {
  const [activeTab, setActiveTab] = useState("monthly");
  const [loadingPlanKey, setLoadingPlanKey] = useState(null);
  const [checkoutError, setCheckoutError] = useState("");
  const [finalizingCheckout, setFinalizingCheckout] = useState(false);
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
  const [searchParams] = useSearchParams();
  const { refreshUser } = useAuth();

  // Shared with AccountSecurity.jsx's billing card - same
  // subscriptionApi.getStatus() call, same queryKeys.subscription.status()
  // key, so the two pages genuinely share this cache instead of each
  // independently re-fetching (this was the exact cache-sharing
  // opportunity flagged when useBillingStatus.js was first built).
  const { data: subscriptionStatus, isLoading: statusLoading, refetch: refetchStatus } = useBillingStatus();
  const checkoutMutation = useCreateCheckoutSessionMutation();

  // Syncs the tab from the fetched status - matches the original's
  // `if (data?.billingCycle) setActiveTab(data.billingCycle)` inside
  // loadStatus, now reacting to the shared query's data instead.
  useEffect(() => {
    if (subscriptionStatus?.billingCycle) setActiveTab(subscriptionStatus.billingCycle);
  }, [subscriptionStatus]);

  // Handles the `/subscription/success?session_id=...` redirect Stripe sends
  // the browser back to after a successful Checkout. Stripe's webhook
  // usually updates MongoDB within a second or two, so we poll briefly
  // before sending the user into the app. Same bounded retry (6 attempts,
  // 1.5s apart) as the original - now driven through the shared query's
  // own refetch() instead of a standalone loadStatus() call, so both
  // paths (normal load and this finalize loop) go through one query.
  useEffect(() => {
    const sessionId = searchParams.get("session_id");
    if (!sessionId) return;

    let cancelled = false;
    setFinalizingCheckout(true);

    const finalize = async () => {
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const { data } = await refetchStatus();
        if (cancelled) return;
        if (data?.hasActiveAccess) {
          await refreshUser();
          if (!cancelled) navigate("/", { replace: true });
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      // Webhook hasn't caught up yet - let the user continue rather than
      // stall indefinitely; ProtectedRoute will re-check on next navigation.
      if (!cancelled) {
        await refreshUser();
        setFinalizingCheckout(false);
      }
    };

    finalize();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleCategory = (planKey, categoryName) => {
    const key = `${planKey}-${categoryName}`;
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const currentPlanKey = subscriptionStatus?.hasActiveAccess ? subscriptionStatus.subscriptionPlan : null;

  const handleUpgrade = async (plan) => {
    if (plan.comingSoon || plan.key === currentPlanKey) return;

    setCheckoutError("");
    setLoadingPlanKey(plan.key);
    try {
      const { data } = await checkoutMutation.mutateAsync({ planKey: plan.key, billingCycle: activeTab });
      if (!data?.url) {
        throw new Error("Could not start checkout. Please try again.");
      }
      window.location.href = data.url;
      // On success the browser navigates away to Stripe Checkout, so there's
      // nothing else to do here.
    } catch (err) {
      setCheckoutError(err?.response?.data?.message || err?.message || "Something went wrong starting checkout. Please try again.");
      setLoadingPlanKey(null);
    }
  };

  if (statusLoading || finalizingCheckout) {
    return (
      <Box
        sx={{
          width: "100vw",
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          gap: 2,
          alignItems: "center",
          justifyContent: "center",
          background: "#F7F5FF",
        }}
      >
        <CircularProgress />
        {finalizingCheckout && (
          <Typography sx={{ color: "#6B7280", fontSize: 14 }}>
            Finishing up your subscription…
          </Typography>
        )}
      </Box>
    );
  }

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
        <IconButton onClick={() => navigate("/")}>
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

            {/* Free trial status - only relevant while the account has no
                Stripe subscription record at all. Purely informational; the
                actual access decision is made server-side by
                User.hasActiveAccess(). */}
            {subscriptionStatus?.subscriptionStatus === "none" &&
              subscriptionStatus?.trial?.endsAt &&
              (subscriptionStatus.trial.isActive ? (
                <Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}>
                  <Alert severity="info" sx={{ borderRadius: "8px" }}>
                    {subscriptionStatus.trial.daysRemaining === 0
                      ? "Your free trial ends today."
                      : `Your free trial ends in ${subscriptionStatus.trial.daysRemaining} day${
                          subscriptionStatus.trial.daysRemaining === 1 ? "" : "s"
                        }. Choose a plan below to keep uninterrupted access.`}
                  </Alert>
                </Box>
              ) : (
                <Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}>
                  <Alert severity="warning" sx={{ borderRadius: "8px" }}>
                    Your free trial has expired. Choose a plan below to continue.
                  </Alert>
                </Box>
              ))}

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
                          {YEARLY_TOGGLE_LABEL}
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
              {plans.map((plan) => {
                const currentPricing = plan.pricing ? plan.pricing[activeTab] : null;
                const isLoading = loadingPlanKey === plan.key;
                const isCurrent = plan.key === currentPlanKey;

                return (
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
                        {!currentPricing ? (
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
                              {currentPricing.oldPrice}
                            </Typography>

                            <Typography
                              sx={{
                                fontSize: 40,
                                fontWeight: 600,
                                color: "#111827",
                                lineHeight: 1,
                              }}
                            >
                              {currentPricing.price}
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
                            {currentPricing ? currentPricing.unitLabel : "AED/month"}
                          </Typography>
                          <Typography sx={{ color: "#6B7280", fontSize: 13, lineHeight: 1.4 }}>
                            (including tax)
                          </Typography>
                        </Box>
                      </Box>

                      {currentPricing && activeTab === "yearly" && currentPricing.monthlyEquivalent && (
                        <Typography sx={{ color: "#6B7280", fontSize: 13, mt: 0.75 }}>
                          Equivalent to AED {currentPricing.monthlyEquivalent}/month
                        </Typography>
                      )}

                      {currentPricing && <SaveBadge percent={currentPricing.savePercent} />}

                      <Button
                        fullWidth
                        disabled={plan.comingSoon || isLoading}
                        variant={isCurrent ? "outlined" : "contained"}
                        onClick={() => handleUpgrade(plan)}
                        sx={{
                          mt: 4,
                          height: 44,
                          borderRadius: "8px",
                          textTransform: "none",
                          fontWeight: 600,
                          backgroundColor: plan.comingSoon
                            ? "#93A6F0"
                            : isCurrent
                            ? "transparent"
                            : "#2554E8",
                          borderColor: "#D1D5DB",
                          color: isCurrent ? "#6B7280" : "#fff",
                          "&.Mui-disabled": {
                            backgroundColor: plan.comingSoon ? "#93A6F0" : undefined,
                            color: "#fff",
                          },
                          "&:hover": {
                            backgroundColor: isCurrent ? "#F9FAFB" : "#1E40C8",
                            borderColor: "#D1D5DB",
                          },
                        }}
                      >
                        {isLoading ? (
                          <CircularProgress size={20} sx={{ color: "inherit" }} />
                        ) : plan.comingSoon ? (
                          "Coming Soon"
                        ) : isCurrent ? (
                          "Your Current Plan"
                        ) : (
                          `Upgrade to ${plan.name.replace("Crewio ", "")}`
                        )}
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
                );
              })}
            </Box>
          </Box>
        </Box>
      </Box>

      <Snackbar
        open={!!checkoutError}
        autoHideDuration={6000}
        onClose={() => setCheckoutError("")}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity="error" onClose={() => setCheckoutError("")} sx={{ width: "100%" }}>
          {checkoutError}
        </Alert>
      </Snackbar>
    </Box>
  );
}

