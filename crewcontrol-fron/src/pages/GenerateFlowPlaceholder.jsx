import { Box, Button, Typography } from "@mui/material";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import { useNavigate, useParams } from "react-router-dom";

const FLOW_LABELS = {
  employees: "Employee",
  company: "Company",
};

function GenerateFlowPlaceholder() {
  const navigate = useNavigate();
  const { type } = useParams();
  const target = FLOW_LABELS[type] || "Record";

  return (
    <Box
      sx={{
        px: "40px",
        py: "32px",
      }}
    >
      <Box
        sx={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-card)",
          borderRadius: "12px",
          p: "24px",
          maxWidth: 720,
        }}
      >
        <Typography sx={{ fontSize: 22, fontWeight: 600, color: "var(--text-primary)", mb: "10px" }}>
          {target} Generate Flow
        </Typography>
        <Typography sx={{ fontSize: 14, color: "var(--text-secondary)", mb: "20px" }}>
          This flow is ready for your upcoming design. The redirection is now connected.
        </Typography>

        <Button
          variant="outlined"
          startIcon={<ArrowBackRoundedIcon />}
          onClick={() => navigate(-1)}
          sx={{
            height: 32,
            textTransform: "none",
            borderRadius: "8px",
          }}
        >
          Go Back
        </Button>
      </Box>
    </Box>
  );
}

export default GenerateFlowPlaceholder;

