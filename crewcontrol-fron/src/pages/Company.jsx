import { Box, Button } from "@mui/material";
import { useState } from "react";
import AddIcon from "@mui/icons-material/Add";
import { useNavigate } from "react-router-dom";

import CompanyGrid from "../components/company/CompanyGrid";
import AssignEmployeeDialog from "../components/company/AssignEmployeeDialog";
import NoDataOverlay from "../components/common/NoDataOverlay";
import { useCompaniesPageData } from "../hooks/useCompaniesPageData";
import { useToggleCompanyStatusMutation } from "../hooks/mutations/useCompanyMutations";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../queryKeys";

function Company() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { companyRows, isLoading: loading } = useCompaniesPageData();
  const toggleStatusMutation = useToggleCompanyStatusMutation();
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState(null);

  const hasCompanies = companyRows.length > 0;

  const handleDeactivateCompany = (companyId, currentStatus) => {
    const nextStatus = currentStatus === "active" ? "deactivate" : "active";
    const apiStatus = currentStatus === "active" ? "inactive" : "active";
    toggleStatusMutation.mutate({ companyId, apiStatus, nextStatus });
  };

  const handleOpenAssignDialog = (companyId) => {
    setSelectedCompanyId(companyId);
    setIsAssignDialogOpen(true);
  };

  const handleCloseAssignDialog = () => {
    setIsAssignDialogOpen(false);
    setSelectedCompanyId(null);
  };

  // Was a full loadCompanies() refetch - now a targeted invalidation of
  // exactly the keys an assignment change actually affects (this page's
  // employees query, which assignedCompanyId derives from, and the
  // companies list itself), letting React Query's background refetch
  // replace the old full-page reload.
  const handleAssignedEmployeesUpdated = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.employees.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
  };

  if (!loading && !hasCompanies) {
    return (
      <NoDataOverlay
        title="No companies added yet"
        description="Add a company to start assigning workers and generating invoices."
        actionLabel="Add Companies"
        onCancel={() => navigate("/")}
        onAction={() => navigate("/add-company")}
      />
    );
  }

  return (
    <Box
      sx={{
        px: "40px",
        pt: "24px",
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      {/* ================= ONLY ADD COMPANY BUTTON ================= */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "flex-end",
        }}
      >
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => navigate("/add-company")}
          sx={{
            height: 32,
            textTransform: "none",
            px: 2,
          }}
        >
          Add Company
        </Button>
      </Box>

      {/* ================= COMPANY CARDS CONTAINER ================= */}
      <Box
        sx={{
          bgcolor: "var(--bg-surface)",
          border: "1px solid var(--border-card)",
          borderRadius: 1.5,
          p: "20px",
        }}
      >
        <CompanyGrid
          companies={companyRows}
          onDeactivateCompany={handleDeactivateCompany}
          onAssignEmployees={handleOpenAssignDialog}
        />
      </Box>

      <AssignEmployeeDialog
        open={isAssignDialogOpen}
        onClose={handleCloseAssignDialog}
        companyId={selectedCompanyId}
        onAssigned={handleAssignedEmployeesUpdated}
      />
    </Box>
  );
}

export default Company;

