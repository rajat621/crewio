import { Box, Button, Typography } from "@mui/material";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import ArrowBackIosIcon from "@mui/icons-material/ArrowBackIos";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

const FAQ_ITEMS = [
  {
    id: "faq-1",
    question: "How do I add a new employee?",
    answer:
      "Navigate to the Employees section and click the 'Add New' button. Enter the employee's full name, email, contact number, designation, and employment type. You can also upload employee documents if needed. Once all required fields are filled, click the 'Save' button. The employee will be added to your system and you can then assign them to companies or projects.",
  },
  {
    id: "faq-2",
    question: "How do I assign an employee to a company?",
    answer:
      "Go to the Employees section and select the employee you want to assign. Click on their profile to open the details view. In the 'Company' field, select the desired company from the dropdown menu. You can assign multiple companies to a single employee for flexible workforce management. After making your selection, click 'Save' to apply the changes. The assignment will be reflected in the system immediately.",
  },
  {
    id: "faq-3",
    question: "How do I generate a tax invoice?",
    answer:
      "Navigate to the Tax Invoices section and click the 'Add New' button. Fill in the invoice details including the company information, employee details, service description, and amount. You can use templates for consistent formatting. Review all the information carefully before clicking 'Generate'. The system will create a professional tax invoice that you can download or send directly to clients.",
  },
  {
    id: "faq-4",
    question: "How do I download an invoice?",
    answer:
      "Go to the Tax Invoices section and locate the invoice you need. Click on the invoice to view its details. You'll see a 'Download' button in the top-right corner of the page. Click it to download the invoice as a PDF file to your computer. You can also print the invoice directly from the view page using your browser's print function.",
  },
  {
    id: "faq-5",
    question: "What does \"On Hold Worker\" mean?",
    answer:
      "An 'On Hold Worker' is an employee whose assignment or employment has been temporarily paused. This status is useful when you need to stop active assignments without permanently removing the employee from the system. On hold workers won't appear in active assignment lists or KPI calculations. You can reactivate them at any time by changing their status back to active. This is commonly used during leave periods or temporary project pauses.",
  },
];


function HelpSupportFaq() {
  const navigate = useNavigate();
  const [expandedItemId, setExpandedItemId] = useState(null);

  const toggleItem = (id) => {
    setExpandedItemId((prev) => (prev === id ? null : id));
  };

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
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-input)",
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

        <Typography
          sx={{
            fontSize: "18px",
            fontWeight: 600,
            color: "var(--text-primary)",
            mb: "16px",
          }}
        >
          Help & Support
        </Typography>

        <Typography
          sx={{
            fontSize: "14px",
            color: "var(--text-secondary)",
            mb: "16px",
          }}
        >
          Find answers to common questions about managing employees, companies, and invoices in CrewControl
        </Typography>

        <Box
          sx={{
            border: "1px solid var(--border-input)",
            borderRadius: "8px",
            p: "20px",
          }}
        >
          <Typography
            sx={{
              fontSize: "14px",
              fontWeight: 600,
              color: "var(--text-primary)",
              mb: "10px",
            }}
          >
            FAQs
          </Typography>

          <Box sx={{ maxWidth: "560px" }}>
            {FAQ_ITEMS.map((item) => (
              <Box
                key={item.id}
                sx={{
                  border: "1px solid #DADADA",
                  borderRadius: "10px",
                  p: "10px 12px",
                  mb: "8px",
                  backgroundColor: "var(--bg-surface)",
                  cursor: "pointer",
                }}
                onClick={() => toggleItem(item.id)}
              >
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "8px",
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: "16px",
                      fontWeight: 500,
                      color: "#2C2C31",
                      lineHeight: 1.2,
                    }}
                  >
                    {item.question}
                  </Typography>

                  {expandedItemId === item.id ? (
                    <KeyboardArrowUpIcon sx={{ fontSize: 18, color: "#1F1F1F" }} />
                  ) : (
                    <KeyboardArrowDownIcon sx={{ fontSize: 18, color: "#1F1F1F" }} />
                  )}
                </Box>

                {expandedItemId === item.id && (
                  <Typography
                    sx={{
                      fontSize: "14px",
                      color: "#7C7C85",
                      mt: "6px",
                      pr: "24px",
                      lineHeight: 1.35,
                    }}
                  >
                    {item.answer}
                  </Typography>
                )}
              </Box>
            ))}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

export default HelpSupportFaq;

