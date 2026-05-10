import { Box, Button } from "@mui/material";
import { useEffect, useState } from "react";
import AddIcon from "@mui/icons-material/Add";
import { useNavigate } from "react-router-dom";

import CompanyGrid from "../components/company/CompanyGrid";
import NoDataOverlay from "../components/common/NoDataOverlay";
import { companiesApi } from "../api/companies";

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

const mapCompanyToCard = (company) => {
  const start = formatDate(company?.contractStartDate);
  const end = formatDate(company?.contractEndDate);

  return {
    id: company?._id,
    name: company?.name || "Unnamed company",
    status: company?.status === "inactive" ? "deactivate" : "active",
    dateRange: start && end ? `${start} - ${end}` : "No contract period",
    totalWorkers: Array.isArray(company?.assignedWorkers)
      ? company.assignedWorkers.length
      : 0,
    present: 0,
    absent: 0,
    onLeave: 0,
    phone: company?.telephoneNumber || company?.mobileNumber || "-",
    poBox: company?.poBox || "-",
    fax: company?.faxNumber || "-",
    address: company?.address || "-",
    trn: company?.trn || "-",
    workers: [],
  };
};

function Company() {
  const navigate = useNavigate();
  const [companyRows, setCompanyRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const loadCompanies = async () => {
      try {
        setLoading(true);
        const response = await companiesApi.getCompanies();
        const companies = response?.data?.data || [];
        if (active) {
          setCompanyRows(companies.map(mapCompanyToCard));
        }
      } catch (error) {
        if (active) {
          setCompanyRows([]);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadCompanies();

    return () => {
      active = false;
    };
  }, []);

  const hasCompanies = companyRows.length > 0;

  const handleDeactivateCompany = async (companyId) => {
    try {
      await companiesApi.updateCompany(companyId, { status: "inactive" });
      setCompanyRows((prev) =>
        prev.map((item) =>
          item.id === companyId ? { ...item, status: "deactivate" } : item
        )
      );
    } catch (error) {
      // Keep current UI state if backend update fails.
    }
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
          bgcolor: "#FFFFFF",
          border: "1px solid #DEDEDE",
          borderRadius: 1.5,
          p: "20px",
        }}
      >
        <CompanyGrid companies={companyRows} onDeactivateCompany={handleDeactivateCompany} />
      </Box>
    </Box>
  );
}

export default Company;
