import { Box, Typography } from "@mui/material";
import SupportAgentOutlinedIcon from "@mui/icons-material/SupportAgentOutlined";
import { useNavigate } from "react-router-dom";

const CARD_BG = "#F7F5FF";
const CARD_BORDER = "#ECEAF6";

function HelpSupport() {
  const navigate = useNavigate();

  const SupportCard = ({ title, description, onClick, disabled = false, height = 90 }) => (
    <Box
      onClick={disabled ? undefined : onClick}
      sx={{
        width: "282px",
        height: `${height}px`,
        borderRadius: "10px",
        border: `1px solid ${CARD_BORDER}`,
        backgroundColor: CARD_BG,
        px: "16px",
        py: "20px",
        display: "flex",
        alignItems: "center",
        gap: "16px",
        cursor: disabled ? "not-allowed" : onClick ? "pointer" : "default",
        opacity: disabled ? 0.55 : 1,
        transition: "all 0.15s ease",
        "&:hover": {
          borderColor: !disabled && onClick ? "#D7D2EE" : CARD_BORDER,
          backgroundColor: !disabled && onClick ? "#EFEAFF" : CARD_BG,
        },
      }}
    >
      <Box
        sx={{
          width: "24px",
          height: "24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flex: "0 0 24px",
        }}
      >
        <SupportAgentOutlinedIcon sx={{ fontSize: 24, color: "#2FB14D" }} />
      </Box>

      <Box>
        <Typography sx={{ fontSize: "16px", color: "#141414", fontWeight: 500, lineHeight: "26px" }}>
          {title}
        </Typography>
        <Typography sx={{ fontSize: "14px", color: "#808080", mt: "12px", fontWeight: 400, lineHeight: "100%" }}>
          {description}
        </Typography>
      </Box>
    </Box>
  );

  return (
    <Box
      sx={{
        flex: 1,
        minHeight: "100vh",
        backgroundColor: "#F7F5FF",
        px: "40px",
        py: "24px",
      }}
    >
      <Box
        sx={{
          backgroundColor: "#FFFFFF",
          border: "1px solid #E5E7EB",
          borderRadius: "10px",
          p: "24px",
        }}
      >
        <Typography
          sx={{
            fontSize: "18px",
            fontWeight: 600,
            color: "#111827",
            mb: "16px",
          }}
        >
          Help & Support
        </Typography>

        <Typography sx={{ fontSize: "14px", color: "#808080", mb: "16px" }}>
          Use the Authenticator to get verification codes for better security
        </Typography>

        <Box
          sx={{
            border: "1px solid #E5E7EB",
            borderRadius: "8px",
            p: "20px 16px",
            mb: "16px",
          }}
        >
          <Typography sx={{ fontSize: "14px", fontWeight: 600, lineHeight: "20px", color: "#141414", mb: "16px" }}>
            Quick Help
          </Typography>

          <Box
            sx={{
              display: "flex",
              gap: "16px",
            }}
          >
            <SupportCard
              title="FAQs"
              description="Common question about company name"
              onClick={() => navigate("/help-support/faqs")}
              height={90}
            />
            <SupportCard
              title="Guides"
              description="Short tutorials for getting started"
              disabled
              height={90}
            />
          </Box>
        </Box>

        <Box
          sx={{
            border: "1px solid #E5E7EB",
            borderRadius: "8px",
            p: "20px 16px",
          }}
        >
          <Typography sx={{ fontSize: "14px", fontWeight: 600, lineHeight: "20px", color: "#141414", mb: "16px" }}>
            Contact Support
          </Typography>

          <Box
            sx={{
              display: "flex",
              gap: "16px",
            }}
          >
            <SupportCard title="Email Support" description="Get help by email." onClick={() => navigate("/email-support")} height={73} />
            <SupportCard title="Community" description="Connect with company users." onClick={() => navigate("/community-support")} height={73} />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

export default HelpSupport;
