import { Box, Button, Typography } from "@mui/material";
import ArrowBackIosIcon from "@mui/icons-material/ArrowBackIos";
import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined";
import PhoneOutlinedIcon from "@mui/icons-material/PhoneOutlined";
import AccessTimeOutlinedIcon from "@mui/icons-material/AccessTimeOutlined";
import { useNavigate } from "react-router-dom";

const CARD_BG = "#F7F5FF";
const CARD_BORDER = "#ECEAF6";
const SUPPORT_EMAIL = "support@crewcontrol.com";

function EmailSupport() {
  const navigate = useNavigate();

  const ContactItem = ({ icon: Icon, title, content, email }) => (
    <Box
      sx={{
        display: "flex",
        gap: "16px",
        paddingBottom: "20px",
        paddingTop: "20px",
        borderBottom: "1px solid #E5E7EB",
        "&:last-child": {
          borderBottom: "none",
          paddingBottom: "16px",
        },
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          width: "24px",
          minWidth: "24px",
          height: "24px",
          flex: "0 0 24px",
          mt: "2px",
        }}
      >
        <Icon sx={{ fontSize: 24, color: "#2FB14D" }} />
      </Box>

      <Box sx={{ flex: 1 }}>
        <Typography sx={{ fontSize: "14px", color: "#141414", fontWeight: 600, mb: "6px" }}>
          {title}
        </Typography>
        <Typography sx={{ fontSize: "13px", color: "#808080", fontWeight: 400, lineHeight: "20px" }}>
          {content}
          {email ? (
            <Box
              component="a"
              href={`mailto:${email}`}
              sx={{
                color: "#1D4ED8",
                fontWeight: 500,
                textDecoration: "none",
                ml: "4px",
                "&:hover": {
                  textDecoration: "underline",
                },
              }}
            >
              {email}
            </Box>
          ) : null}
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
      {/* Back Button */}
      
      {/* Main Content Card */}
      <Box
        sx={{
          backgroundColor: "#FFFFFF",
          border: "1px solid #E5E7EB",
          borderRadius: "10px",
          p: "24px",
        }}
      >
        <button
          onClick={() => navigate("/help-support")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "4px",
            fontSize: "14px",
            width: "75px",
            height: "32px",
            color: "#374151",
            background: "#fff",
            border: `1px solid #DEDEDE`,
            borderRadius: "8px",
            padding: "5px 12px",
            cursor: "pointer",
            marginBottom: "20px",
            fontFamily: "inherit",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#F9FAFB")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
        >
          <ArrowBackIosIcon sx={{ fontSize: 12, transform: "translateX(-1px)" }} />
          Back
        </button>

        <Typography
          sx={{
            fontSize: "18px",
            fontWeight: 600,
            color: "#111827",
            mb: "8px",
          }}
        >
          Still need help?
        </Typography>

        <Typography sx={{ fontSize: "14px", color: "#808080", mb: "24px" }}>
          Reach out to our support team using any of the channels below. We're here to help!
        </Typography>

        {/* Contact Support Card */}
        <Box
          sx={{
            border: `1px solid ${CARD_BORDER}`,
            backgroundColor: CARD_BG,
            borderRadius: "10px",
            px: "24px",
            py: "20px",
          }}
        >
          <Typography sx={{ fontSize: "14px", fontWeight: 600, lineHeight: "20px", color: "#141414", mb: "16px" }}>
            Contact Support
          </Typography>

          <ContactItem
            icon={EmailOutlinedIcon}
            title="Email Support"
            content="Send us an email at"
            email={SUPPORT_EMAIL}
          />

          <ContactItem
            icon={PhoneOutlinedIcon}
            title="Phone Support"
            content="+971 (0) 4 XXX XXXX - Available Monday to Friday, 9 AM to 5 PM GST"
          />

          <ContactItem
            icon={AccessTimeOutlinedIcon}
            title="Response Time"
            content="We typically respond to all inquiries within 24 business hours. Urgent matters may receive priority handling."
          />
        </Box>
      </Box>
    </Box>
  );
}

export default EmailSupport;
