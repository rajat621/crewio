import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { CircularProgress, Box } from "@mui/material";

import { useAuth } from "../context/AuthContext";
import { ProtectedRoute } from "../components/auth/ProtectedRoute";

// layouts
import DashboardLayout from "../layouts/DashboardLayout";
import FlowLayout from "../layouts/FlowLayout";

// dashboard pages
import Home from "../pages/Home";
import Employees from "../pages/Employees";
import Company from "../pages/Company";
import CompanyDetail from "../pages/CompanyDetail";
import Chat from "../pages/Chat";
import EmployeeProfile from "../pages/EmployeeProfile";
import GenerateFlowPlaceholder from "../pages/GenerateFlowPlaceholder";
import UserProfile from "../pages/UserProfile";
import CompanyProfile from "../pages/CompanyProfile";
import AccountSecurity from "../pages/AccountSecurity";
import HelpSupport from "../pages/HelpSupport";
import HelpSupportFaq from "../pages/HelpSupportFaq";
import EmailSupport from "../pages/EmailSupport";
import CommunitySupport from "../pages/CommunitySupport";
import Subscription from "../pages/Subscription";

// tax invoices
import TaxInvoiceList from "../pages/tax-invoices/TaxInvoiceList";
import GenerateTaxInvoice from "../pages/tax-invoices/generate/GenerateTaxInvoice";
import SalarySlip from "../pages/SalarySlip";
import GenerateSalarySlip from "../pages/salary-slip/GenerateSalarySlip";
import AddEmployee from "../pages/AddEmployee";
import AddCompany from "../pages/AddCompany";
import Expenses from "../pages/Expenses";

// misc
import SignIn from "../pages/SignIn";
import SignUp from "../pages/SignUp";
import VerifyEmail from "../pages/VerifyEmail";
import AuthCallback from "../pages/AuthCallback";
import OnboardingCompanyProfile from "../pages/OnboardingCompanyProfile";
import OnboardingCompanyLogo from "../pages/OnboardingCompanyLogo";
import OnboardingCompanyTemplate from "../pages/OnboardingCompanyTemplate";
import OnboardingAuthorizedSignature from "../pages/OnboardingAuthorizedSignature";
import OnboardingSuccess from "../pages/OnboardingSuccess";
import ComprehensiveOnboarding from "../pages/ComprehensiveOnboarding";
import NotFound from "../pages/NotFound";

function App() {
  const { isAuthenticated, isLoading } = useAuth();

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
      <Routes>
        {/* AUTH */}
        <Route
          path="/"
          element={isAuthenticated ? <DashboardLayout /> : <SignIn />}
        >
          {isAuthenticated && <Route index element={<Home />} />}
        </Route>
        <Route path="/signin" element={<SignIn />} />
        <Route path="/signup" element={<ComprehensiveOnboarding />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/auth-callback" element={<AuthCallback />} />
        {/* DEV: Temporarily accessible without auth for development */}
        <Route path="/onboarding/company-profile" element={<OnboardingCompanyProfile />} />
        <Route path="/onboarding/company-logo" element={<OnboardingCompanyLogo />} />
        <Route path="/onboarding/company-template" element={<OnboardingCompanyTemplate />} />
        <Route path="/onboarding/authorized-signature" element={<OnboardingAuthorizedSignature />} />
        <Route path="/onboarding/success" element={<OnboardingSuccess />} />

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
        <Route path="/subscription" element={<Subscription />} />

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
      </Routes>
    </BrowserRouter>
  );
}

export default App;
