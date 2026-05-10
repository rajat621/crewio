import { Box, Typography, Button, IconButton } from "@mui/material";
import ArrowBackIosOutlinedIcon from '@mui/icons-material/ArrowBackIosOutlined';
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import { useNavigate } from "react-router-dom";

function Stat({ label, value, color }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <Typography sx={{ fontSize: "10px",lineHeight: "14px", fontWeight: 300, letterSpacing: "0.2px",color: "#5F5F6F" }}>{label}</Typography>
      <Typography sx={{ fontSize: "10px",lineHeight: "14px", fontWeight: 500, letterSpacing: "0.2px", color }}>{String(value).padStart(2, "0")}</Typography>
    </Box>
  );
}

function CompanyHeader({ company, onAssignEmployee }) {
  const navigate = useNavigate();

  return (
    <Box>
      {/* ── Enclosed section: Row 1 (name/date) + Row 2 (icon/total) with #F7F5FF bg ── */}
      <Box
        sx={{
          backgroundColor: "#F7F5FF",
          p: "20px 16px",
        }}
      >
        {/* Row 1: Back arrow + Company name + date */}
        <Box sx={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
          <Box
            onClick={() => navigate("/company")}
            sx={{
            mt: "4px",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            cursor: "pointer",
            height: 32,
            width: 32,
            border: "1px solid #DEDEDE", //border of arror box in list next to chat 
            borderRadius: "8px",
            paddingLeft: 0,
            backgroundColor:"transparent",
            "&:hover": { backgroundColor: "#EDE9FF" }
          }}
          >
          <ArrowBackIosOutlinedIcon sx={{ color: "#808080", fontSize: 14 }} />
          </Box>

          <Box>
            <Typography
              sx={{ fontSize: "32px", fontWeight: 500, color: "#141414", lineHeight: "44px" }}
            >
              {company.name}
            </Typography>
            <Typography
              sx={{ fontSize: "12px", color: "#6B7280", mt: "2px", lineHeight: "14px", letterSpacing: "0.24px" }}
            >
              {company.dateRange}
            </Typography>
          </Box>
        </Box>

        {/* Row 2: Icon (left) ↔ Total workers label + number (right) */}
        <Box
          sx={{
            mt: "24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Box
            sx={{
              width: "44px",
              height: "44px",
              borderRadius: "50%",
              backgroundColor: "#1D4ED8",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <GroupsOutlinedIcon sx={{ color: "#FFFFFF", fontSize: 28 }} />
          </Box>

          <Box sx={{ textAlign: "right" }}>
            <Typography sx={{ fontSize: "12px", color: "#808080" ,lineHeight: "14px", letterSpacing: "0.24px" }}>
              Total worker assigned
            </Typography>
            <Typography
              sx={{ fontSize: "32px", fontWeight: 600, color: "#141414", lineHeight: "26px",mt: "8px" }}
            >
              {company.totalWorkers}
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* ── Row 3: Stats + Assignee button — outside the colored bg ── */}
      <Box
        sx={{
          mt: "12px",
          p: "0 16px 16px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: "32px" }}>
          <Stat label="Present workers"  value={company.present}  color="#0492DA" />
          <Stat label="Absent workers"   value={company.absent}   color="#C70600" />
          <Stat label="On leave workers" value={company.onLeave}  color="#06C401" />
        </Box>

        <Button
          variant="contained"
          onClick={onAssignEmployee}
          sx={{
            textTransform: "none",
            backgroundColor: "#2563EB",
            borderRadius: "8px",
            fontSize: "12px",
            fontWeight: 500,
            p: "4px 12px",
            height: "32px",
            whiteSpace: "nowrap",
            boxShadow: "none",
            "&:hover": { backgroundColor: "#1D4ED8", boxShadow: "none" },
          }}
        >
          Assignee Employee
        </Button>
      </Box>
    </Box>
  );
}

export default CompanyHeader;