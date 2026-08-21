import { useMemo, useState } from "react";
import {
  Box,
  Button,
  FormControl,
  MenuItem,
  Select,
  TextField,
  Typography,
} from "@mui/material";
import ArrowBackIosIcon from "@mui/icons-material/ArrowBackIos";
import AttachmentOutlinedIcon from "@mui/icons-material/AttachmentOutlined";
import { useNavigate } from "react-router-dom";

const SUPPORT_EMAIL = "support@crewcontrol.com";
const PAGE_BG = "#F7F5FF";
const CARD_BORDER = "var(--border-input)";

const ISSUE_TYPES = [
  "Login or access issue",
  "Employee management issue",
  "Company profile issue",
  "Invoice or finance issue",
  "File upload issue",
  "Other",
];

function CommunitySupport() {
  const navigate = useNavigate();
  const [issueType, setIssueType] = useState("");
  const [message, setMessage] = useState("");
  const [attachmentName, setAttachmentName] = useState("");

  const subject = useMemo(() => {
    return issueType ? `CrewControl Support - ${issueType}` : "CrewControl Support Request";
  }, [issueType]);

  const handleAttachmentChange = (event) => {
    const file = event.target.files?.[0];
    setAttachmentName(file ? file.name : "");
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    const emailBody = [
      `Issue Type: ${issueType || "Not selected"}`,
      "",
      "Message:",
      message || "No message provided.",
      "",
      attachmentName ? `Attachment: ${attachmentName}` : "Attachment: None",
    ].join("\n");

    const mailtoUrl = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}`;
    window.location.href = mailtoUrl;
  };

  return (
    <Box
      sx={{
        flex: 1,
        minHeight: "100vh",
        backgroundColor: PAGE_BG,
        px: "40px",
        py: "24px",
      }}
    >
      <Box
        sx={{
          backgroundColor: "var(--bg-surface)",
          border: `1px solid ${CARD_BORDER}`,
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
            border: `1px solid var(--border-card)`,
            borderRadius: "8px",
            padding: "5px 12px",
            cursor: "pointer",
            marginBottom: "20px",
            fontFamily: "inherit",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-surface)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
        >
          <ArrowBackIosIcon sx={{ fontSize: 12, transform: "translateX(-1px)" }} />
          Back
        </button>
      
        <Typography sx={{ fontSize: "18px", fontWeight: 600, color: "var(--text-primary)", mb: "8px" }}>
          Help & Support
        </Typography>

        <Typography sx={{ fontSize: "14px", color: "var(--text-secondary)", mb: "24px" }}>
          Tell us what went wrong and our team will investigate.
        </Typography>

        <Box
          component="form"
          onSubmit={handleSubmit}
          sx={{
            border: `1px solid ${CARD_BORDER}`,
            borderRadius: "8px",
            p: "20px",
            maxWidth: "560px",
          }}
        >
          <Typography sx={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", mb: "8px" }}>
            Report an Issue
          </Typography>

          <Typography sx={{ fontSize: "14px", color: "var(--text-secondary)", mb: "24px" }}>
            Choose the issue type, describe what happened, and send it directly to our support team.
          </Typography>

          <FormControl fullWidth sx={{ mb: "20px" }}>
            <Select
              value={issueType}
              displayEmpty
              renderValue={(selected) =>
                selected ? (
                  selected
                ) : (
                  <Box component="span" sx={{ color: "var(--text-secondary)" }}>
                    Issue Type
                  </Box>
                )
              }
              onChange={(event) => setIssueType(event.target.value)}
              sx={{
                backgroundColor: "var(--bg-surface)",
                borderRadius: "8px",
                height: "44px",
                "& .MuiSelect-select": {
                  display: "flex",
                  alignItems: "center",
                  height: "44px",
                  minHeight: "44px",
                  boxSizing: "border-box",
                  padding: "0 14px !important",
                },
              }}
            >
              <MenuItem disabled value="">
                Issue Type
              </MenuItem>
              {ISSUE_TYPES.map((type) => (
                <MenuItem key={type} value={type}>
                  {type}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            label="Message"
            placeholder="Describe the issue you are experiencing"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            multiline
            minRows={6}
            fullWidth
            sx={{
              mb: "20px",
              "& .MuiInputBase-root": {
                alignItems: "flex-start",
                backgroundColor: "var(--bg-surface)",
                borderRadius: "8px",
              },
            }}
          />

          <Box sx={{ mb: "20px" }}>
            <Typography sx={{ fontSize: "14px", color: "var(--text-primary)", fontWeight: 500, mb: "8px" }}>
              Attachment
            </Typography>
            <Box
              sx={{
                display: "flex",
                alignItems: "stretch",
                width: "100%",
                borderRadius: "8px",
                borderColor: CARD_BORDER,
                overflow: "hidden",
                border: "1px solid var(--border-input-hover)",
                backgroundColor: "var(--bg-surface)",
              }}
            >
              <Button
                component="label"
                variant="contained"
                startIcon={<AttachmentOutlinedIcon sx={{ fontSize: 18, color: "var(--bg-surface)" }} />}
                sx={{
                  minWidth: "104px",
                  borderRadius: 0,
                  backgroundColor: "#2F5AE0",
                  color: "var(--bg-surface)",
                  textTransform: "none",
                  fontSize: "14px",
                  fontWeight: 500,
                  px: "14px",
                  boxShadow: "none",
                  "&:hover": {
                    backgroundColor: "#2448BB",
                    boxShadow: "none",
                  },
                }}
              >
                Choose File
                <input hidden type="file" onChange={handleAttachmentChange} />
              </Button>

              <Box
                sx={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  minHeight: "40px",
                  px: "12px",
                  color: attachmentName ? "var(--text-primary)" : "#A3A3A3",
                  fontSize: "14px",
                }}
              >
                {attachmentName || "Upload Screenshot"}
              </Box>
            </Box>
          </Box>

          <Box sx={{ display: "flex", justifyContent: "center" }}>
            <Button
              type="submit"
              sx={{
                minWidth: "120px",
                height: "32px",
                borderRadius: "6px",
                backgroundColor: "#2F5AE0",
                color: "var(--bg-surface)",
                textTransform: "none",
                fontSize: "13px",
                fontWeight: 500,
                px: "16px",
                "&:hover": {
                  backgroundColor: "#2448BB",
                },
              }}
            >
              Submit Request
            </Button>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

export default CommunitySupport;

