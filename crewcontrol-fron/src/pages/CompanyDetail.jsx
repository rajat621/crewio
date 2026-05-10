import { Box, Divider, Typography } from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import CompanyHeader from "../components/company/CompanyHeader";
import CompanyWorkersTable from "../components/company/CompanyWorkersTable";
import CompanyDetailsPanel from "../components/company/CompanyDetailsPanel";
import AssignEmployeeDialog from "../components/company/AssignEmployeeDialog";
import { companiesApi } from "../api/companies";
import { employeesApi } from "../api/employees";

const formatDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

function CompanyDetail() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [company, setCompany]       = useState(null);
  const [draftCompany, setDraftCompany] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const isEditMode = searchParams.get("mode") === "edit";

  const loadCompany = useCallback(async () => {
    const [companyResponse, employeeResponse] = await Promise.all([
      companiesApi.getCompany(id),
      employeesApi.getEmployees({ assignedCompanyId: id, page: 1, limit: 500 }),
    ]);

    const rawCompany       = companyResponse?.data?.data || null;
    const assignedEmployees = employeeResponse?.data?.employees || [];

    if (!rawCompany) {
      setCompany(null);
      return;
    }

    const mappedCompany = {
      id: rawCompany?._id,
      companyRole: rawCompany?.companyRole || 'client',
      name: rawCompany?.name || "Unnamed company",
      dateRange:
        rawCompany?.contractStartDate && rawCompany?.contractEndDate
          ? `${formatDate(rawCompany.contractStartDate)} - ${formatDate(rawCompany.contractEndDate)}`
          : "No contract period",
      status: rawCompany?.status === "inactive" ? "deactivate" : "active",
      totalWorkers: assignedEmployees.length,
      present: 0,
      absent: 0,
      onLeave: 0,
      phone:   rawCompany?.telephoneNumber || rawCompany?.mobileNumber || "-",
      poBox:   rawCompany?.poBox || "-",
      fax:     rawCompany?.faxNumber || "-",
      address: rawCompany?.address || "-",
      trn:     rawCompany?.trn || "-",
      workers: assignedEmployees.map((employee) => ({
        id:     employee?._id,
        name:   `${employee?.firstName || ""} ${employee?.lastName || ""}`.trim() || "-",
        trade:  employee?.trade || "-",
        rate:   Number(employee?.ratePerHour || 0).toFixed(2),
        status: "Valid",
      })),
    };

    setCompany(mappedCompany);
    setDraftCompany(mappedCompany);
  }, [id]);

  useEffect(() => {
    let active = true;

    const loadCompanyData = async () => {
      try {
        setLoading(true);
        await loadCompany();
      } catch (error) {
        if (active) setCompany(null);
      } finally {
        if (active) setLoading(false);
      }
    };

    loadCompanyData();
    return () => { active = false; };
  }, [loadCompany]);

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

  const handleAssignedEmployeesUpdated = async () => {
    await loadCompany();
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
      await companiesApi.updateCompany(id, payload);
      setCompany((prev) => ({ ...prev, ...draftCompany }));
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
          backgroundColor: "#FFFFFF",
          border: "1px solid #DEDEDE",
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
            border: "1px solid #DEDEDE",
            borderRadius: "10px",
            overflow: "hidden",   // lets the F7F5FF bg bleed to card edges
          }}
        >
          {/* Company header: back arrow, name, icon, totals, stats */}
          <CompanyHeader company={company} onAssignEmployee={handleOpenAssignDialog} />

          {/* Divider between header and employee table */}
          <Divider sx={{  borderColor: "#DEDEDE" }} />

          {/* Employee table with search + pagination */}
          <Box sx={{ p: "16px" }}>
            <CompanyWorkersTable workers={company.workers} />
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