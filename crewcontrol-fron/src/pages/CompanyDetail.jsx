import { Box, Divider, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import CompanyHeader from "../components/company/CompanyHeader";
import CompanyWorkersTable from "../components/company/CompanyWorkersTable";
import CompanyDetailsPanel from "../components/company/CompanyDetailsPanel";
import AssignEmployeeDialog from "../components/company/AssignEmployeeDialog";
import { useCompanyDetailData } from "../hooks/useCompanyDetailData";
import { useUpdateCompanyDetailMutation, useRemoveWorkerFromCompanyMutation } from "../hooks/mutations/useCompanyDetailMutations";
import { queryKeys } from "../queryKeys";

function CompanyDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { company, isLoading: loading } = useCompanyDetailData(id);
  const [draftCompany, setDraftCompany] = useState(null);
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const isEditMode = searchParams.get("mode") === "edit";
  const updateCompanyMutation = useUpdateCompanyDetailMutation(id);
  const removeWorkerMutation = useRemoveWorkerFromCompanyMutation(id);

  // Keeps the edit draft in sync with fresh company data - matches the
  // original's behavior of overwriting draftCompany every time loadCompany
  // resolved. Not a data-fetching effect (React Query already owns that),
  // just local-draft synchronization to server data.
  useEffect(() => {
    setDraftCompany(company);
  }, [company]);

  if (loading) {
    return (
      <Box
        sx={{
          flex: 1,
          minHeight: "100vh",
          backgroundColor: "#F0EFFF",
          px: "40px",
          pt: "24px",
        }}
      />
    );
  }

  if (!company) {
    return (
      <Box sx={{ px: "40px", pt: "24px" }}>
        <Typography color="error">Company not found</Typography>
      </Box>
    );
  }

  const handleEditMode   = () => { setSearchParams({ mode: "edit" }); setDraftCompany(company); };
  const handleCancelEdit = () => { setSearchParams({}); setDraftCompany(company); };
  const handleFieldChange = (key, value) => setDraftCompany((prev) => ({ ...prev, [key]: value }));
  const handleOpenAssignDialog = () => setIsAssignDialogOpen(true);
  const handleCloseAssignDialog = () => setIsAssignDialogOpen(false);

  const handleAssignedEmployeesUpdated = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.employees.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.companies.detail(id) });
  };

  const handleViewWorkerProfile = (worker) => {
    if (worker?.id) {
      navigate(`/employees/${worker.id}`);
    }
  };

  const handleRemoveWorker = async (worker) => {
    if (!worker?.id) return;

    try {
      await removeWorkerMutation.mutateAsync(worker.id);
    } catch (error) {
      // Keep current list unchanged if unassign fails.
    }
  };

  const handleSaveEdit = async () => {
    const payload = {
      name:            draftCompany?.name,
      telephoneNumber: draftCompany?.phone,
      poBox:           draftCompany?.poBox,
      faxNumber:       draftCompany?.fax,
      address:         draftCompany?.address,
      trn:             draftCompany?.trn,
      companyRole:     draftCompany?.companyRole || company?.companyRole || 'client',
    };
    try {
      await updateCompanyMutation.mutateAsync(payload);
      // Same immediate-reflect merge the original did (setCompany(prev
      // => ({...prev, ...draftCompany}))) - patches the raw company
      // cache entry (not the derived `company` object, which is
      // recomputed via useMemo) with the same payload fields already
      // sent to the server, so the UI shows the change immediately
      // rather than waiting for the invalidation-triggered refetch.
      queryClient.setQueryData(queryKeys.companies.detail(id), (prev) => (prev ? { ...prev, ...payload } : prev));
      setSearchParams({});
    } catch (error) {
      // Keep edit mode open on failure
    }
  };

  return (
    /*
     * Page background — same purple-tinted bg visible around the outer card
     */
    <Box
      sx={{
        flex: 1,
        minHeight: "100vh",
        backgroundColor: "#F0EFFF",
        px: "40px",
        pt: "24px",
        pb: "40px",
      }}
    >
      {/*
       * ── Single outer white card ──────────────────────────────────────────
       * Both the left panel (header + table) and the right panel
       * (Company Details) live inside this one card, separated by a gap.
       * The right panel has its OWN inner border so it reads as a
       * distinct sub-card within the outer card.
       */}
      <Box
        sx={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-card)",
          borderRadius: "12px",
          p: "20px",
          display: "grid",
          gridTemplateColumns: "1fr 360px",  // left grows, right is fixed 360px
          gap: "16px",
          alignItems: "start",
        }}
      >
        {/* ═══ LEFT PANEL — own bordered card ═══════════════════════════ */}
        <Box
          sx={{
            border: "1px solid var(--border-card)",
            borderRadius: "10px",
            overflow: "hidden",   // lets the F7F5FF bg bleed to card edges
          }}
        >
          {/* Company header: back arrow, name, icon, totals, stats */}
          <CompanyHeader company={company} onAssignEmployee={handleOpenAssignDialog} />

          {/* Divider between header and employee table */}
          <Divider sx={{  borderColor: "var(--border-card)" }} />

          {/* Employee table with search + pagination */}
          <Box sx={{ p: "16px" }}>
            <CompanyWorkersTable
              workers={company.workers}
              onViewProfile={handleViewWorkerProfile}
              onRemoveWorker={handleRemoveWorker}
            />
          </Box>
        </Box>

        {/* ═══ RIGHT PANEL — Company Details sub-card ════════════════════ */}
        <CompanyDetailsPanel
          company={isEditMode ? draftCompany : company}
          editable={isEditMode}
          onEdit={handleEditMode}
          onCancel={handleCancelEdit}
          onSave={handleSaveEdit}
          onFieldChange={handleFieldChange}
        />
      </Box>

      <AssignEmployeeDialog
        open={isAssignDialogOpen}
        onClose={handleCloseAssignDialog}
        companyId={company.id}
        onAssigned={handleAssignedEmployeesUpdated}
      />
    </Box>
  );
}

export default CompanyDetail;
