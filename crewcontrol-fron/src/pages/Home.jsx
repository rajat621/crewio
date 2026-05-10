// src/pages/Home.jsx
import { Box, Typography, Grid, Button, IconButton } from "@mui/material";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { companiesApi } from "../api/companies";
import { isCompanyProfileComplete } from "../utils/companyProfileStatus";
import KpiGrid from "../components/kpi/KPIGrid";
import AttendanceCard from "../components/attendance/AttendanceCard";
import AlertBox from "../components/alerts/AlertBox";

function Home() {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [showCompanyWarning, setShowCompanyWarning] = useState(false);
  const [isWarningDismissed, setIsWarningDismissed] = useState(false);

  useEffect(() => {
    if (!token) {
      setIsWarningDismissed(false);
      return;
    }

    const key = `company-details-warning-dismissed:${token}`;
    setIsWarningDismissed(sessionStorage.getItem(key) === "true");
  }, [token]);

  const handleDismissWarning = () => {
    setIsWarningDismissed(true);
    if (token) {
      const key = `company-details-warning-dismissed:${token}`;
      sessionStorage.setItem(key, "true");
    }
  };

  useEffect(() => {
    let active = true;

    const loadCompanyStatus = async () => {
      const companyId = user?.companyId || user?.company;
      if (!companyId) {
        if (active) setShowCompanyWarning(true);
        return;
      }

      try {
        const response = await companiesApi.getCompany(companyId);
        const company = response?.data?.data || response?.data;
        if (active) {
          setShowCompanyWarning(!isCompanyProfileComplete(company));
        }
      } catch (error) {
        if (active) setShowCompanyWarning(true);
      }
    };

    loadCompanyStatus();

    return () => {
      active = false;
    };
  }, [user?.companyId, user?.company]);

  return (
    <Box
      sx={{
        px: "40px", // left & right = 40px
        pt: "24px", // text from top
        pb: "24px", // bottom gap for highlighted section
      }}
    >
      {showCompanyWarning && !isWarningDismissed && (
        <Box
          sx={{
            mb: "16px",
            border: "1px solid #FDE68A",
            backgroundColor: "#FFFBEB",
            borderRadius: "10px",
            p: "12px 14px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <WarningAmberRoundedIcon sx={{ color: "#D97706", fontSize: 18 }} />
            <Typography sx={{ fontSize: 14, fontWeight: 500, color: "#92400E" }}>
              Please complete the company details.
            </Typography>
          </Box>

          <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Button
              onClick={() => navigate("/company-profile")}
              sx={{
                textTransform: "none",
                height: "32px",
                minHeight: "32px",
                px: "14px",
                borderRadius: "8px",
                border: "1px solid #FCD34D",
                color: "#B45309",
                backgroundColor: "#FFFFFF",
                "&:hover": {
                  backgroundColor: "#FEF3C7",
                },
              }}
            >
              Complete now
            </Button>

            <IconButton
              onClick={handleDismissWarning}
              size="small"
              sx={{
                width: 28,
                height: 28,
                color: "#A16207",
                "&:hover": {
                  backgroundColor: "#FEF3C7",
                },
              }}
              aria-label="Close warning"
            >
              <CloseRoundedIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Box>
        </Box>
      )}

      {/* HEADING */}
      <Box
        sx={{
          height: 32,
          display: "flex",
          alignItems: "center",
          mb: "16px", // text → KPI
        }}
      >
        <Typography fontSize={18} fontWeight={400} color="#757575">
          Hello,&nbsp;
          <Typography
            component="span"
            fontSize={18}
            fontWeight={600}
            color="#141414"
          >
            {user?.firstName || "Jonathan"}!
          </Typography>
        </Typography>
      </Box>

      {/* KPI CARDS */}
      <Grid container spacing={2}>
        <KpiGrid />
      </Grid>

      {/* ATTENDANCE + ALERT */}
      <Grid container spacing={2} sx={{ mt: "0px" }}>
        <Grid item xs={8}>
          <AttendanceCard />
        </Grid>

        <Grid item xs={4}>
          <AlertBox />
        </Grid>
      </Grid>
    </Box>
  );
}

export default Home;
