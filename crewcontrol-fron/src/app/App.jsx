// crewcontrol-fron\src\app\App.jsx
import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { CircularProgress, Box } from "@mui/material";

import { useAuth } from "../context/AuthContext";
import { ProtectedRoute } from "../components/auth/ProtectedRoute";
import { SubscriptionRoute } from "../components/auth/SubscriptionRoute";

// layouts - kept eager (shell chrome needed on essentially every
// authenticated navigation, not worth a network round trip on its own)
import DashboardLayout from "../layouts/DashboardLayout";
import FlowLayout from "../layouts/FlowLayout";

// misc - SignIn kept eager, it's what unauthenticated users see first;
// lazy-loading it would just move the network round trip earlier, not
// remove it.
import SignIn from "../pages/SignIn";

// Closure-pass finding: every route below was a static import, so the
// entire app (every dashboard page, both generate flows, onboarding, the
// invoice preview window, all MUI/recharts/jspdf usage anywhere in any of
// them) landed in one 10.9MB bundle regardless of which single route a
// visitor actually loads. React.lazy + route-level Suspense is the
// standard, low-risk fix for exactly this shape of problem - each import()
// below becomes its own chunk, fetched only when that route is visited.
// No behavior change, just when the JS for a given page is fetched.
const Home = lazy(() => import("../pages/Home"));
const Employees = lazy(() => import("../pages/Employees"));
const Company = lazy(() => import("../pages/Company"));
const CompanyDetail = lazy(() => import("../pages/CompanyDetail"));
const Chat = lazy(() => import("../pages/Chat"));
const EmployeeProfile = lazy(() => import("../pages/EmployeeProfile"));
const GenerateFlowPlaceholder = lazy(() => import("../pages/GenerateFlowPlaceholder"));
const UserProfile = lazy(() => import("../pages/UserProfile"));
const CompanyProfile = lazy(() => import("../pages/CompanyProfile"));
const AccountSecurity = lazy(() => import("../pages/AccountSecurity"));
const HelpSupport = lazy(() => import("../pages/HelpSupport"));
const HelpSupportFaq = lazy(() => import("../pages/HelpSupportFaq"));
const EmailSupport = lazy(() => import("../pages/EmailSupport"));
const CommunitySupport = lazy(() => import("../pages/CommunitySupport"));
const Subscription = lazy(() => import("../pages/Subscription"));

// tax invoices
const TaxInvoiceList = lazy(() => import("../pages/tax-invoices/TaxInvoiceList"));
const GenerateTaxInvoice = lazy(() => import("../pages/tax-invoices/generate/GenerateTaxInvoice"));
const SalarySlip = lazy(() => import("../pages/SalarySlip"));
const GenerateSalarySlip = lazy(() => import("../pages/salary-slip/GenerateSalarySlip"));
const AddEmployee = lazy(() => import("../pages/AddEmployee"));
const AddCompany = lazy(() => import("../pages/AddCompany"));
const Expenses = lazy(() => import("../pages/Expenses"));
const Finance = lazy(() => import("../pages/Finance"));

// misc
const VerifyEmail = lazy(() => import("../pages/VerifyEmail"));
const ForgotPassword = lazy(() => import("../pages/ForgotPassword"));
const ComprehensiveOnboarding = lazy(() => import("../pages/ComprehensiveOnboarding"));
const NotFound = lazy(() => import("../pages/NotFound"));

// chnages
const InvoicePreviewWindow = lazy(() => import("../pages/InvoicePreviewWindow"));

const RouteFallback = () => (
  <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
    <CircularProgress />
  </Box>
);

function App() {
  const { isAuthenticated, isLoading, hasActiveAccess } = useAuth();

  if (isLoading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="100vh"
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <BrowserRouter>
      <Suspense fallback={<RouteFallback />}>
      <Routes>
        {/* AUTH */}
        <Route
          path="/"
          element={isAuthenticated ? <DashboardLayout /> : <SignIn />}
        >
          {isAuthenticated && (
            <Route
              index
              element={hasActiveAccess ? <Home /> : <Navigate to="/subscription" replace />}
            />
          )}
        </Route>
        <Route path="/signin" element={<SignIn />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/signup" element={<ComprehensiveOnboarding />} />
        <Route path="/verify-email" element={<VerifyEmail />} />

        {/* DASHBOARD */}
        <Route
          element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route path="home" element={<Navigate to="/" replace />} />
          <Route path="employees" element={<Employees />} />
          <Route path="employees/:id" element={<EmployeeProfile />} />
          <Route path="company" element={<Company />} />
          <Route path="company/:id" element={<CompanyDetail />} />
          <Route path="tax-invoices" element={<TaxInvoiceList />} />
          <Route path="salary-slip" element={<SalarySlip />} />
          <Route path="expenses" element={<Expenses />} />
          <Route path="finance" element={<Finance />} />
          <Route path="chat" element={<Chat />} />
          <Route path="user-profile" element={<UserProfile />} />
          <Route path="company-profile" element={<CompanyProfile />} />
          <Route path="account-security" element={<AccountSecurity />} />
          <Route path="help-support" element={<HelpSupport />} />
          <Route path="help-support/faqs" element={<HelpSupportFaq />} />
          <Route path="email-support" element={<EmailSupport />} />
          <Route path="community-support" element={<CommunitySupport />} />
          <Route path="salary-slip/generate" element={<GenerateSalarySlip />} />

        </Route>
        <Route
          path="/subscription"
          element={
            <SubscriptionRoute>
              <Subscription />
            </SubscriptionRoute>
          }
        />
        <Route path="/subscription/success" element={<SubscriptionRoute><Subscription /></SubscriptionRoute>} />

        {/* FLOW */}
        <Route
          element={
            <ProtectedRoute>
              <FlowLayout />
            </ProtectedRoute>
          }
        >
          <Route path="tax-invoices/generate" element={<GenerateTaxInvoice />} />
          <Route path="salary-slip/generate" element={<GenerateSalarySlip />} />
          <Route path="add-employee" element={<AddEmployee />} />
          <Route path="add-company" element={<AddCompany />} />
          <Route path="employees/generate" element={<GenerateFlowPlaceholder />} />
          <Route path="company/generate" element={<GenerateFlowPlaceholder />} />
        </Route>

        {/* 404 */}
        <Route path="*" element={<NotFound />} />

        <Route
    path="/invoice-preview/:draftId"
    element={
        <ProtectedRoute>
            <InvoicePreviewWindow />
        </ProtectedRoute>
    }
/>

      </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
