import { Box, Typography } from "@mui/material";
import { useState } from "react";
import AlertAccordion from "./AlertAccordion";

function AlertBox() {
  const [openKey, setOpenKey] = useState(null);

  const toggle = (key) =>
    setOpenKey((prev) => (prev === key ? null : key));

  return (
    <Box
      sx={{
        width: "100%",
        height: 476,
        px: "16px",
        py: "20px",
        backgroundColor: "#FFFFFF",
        border: "1px solid #DEDEDE",
        borderRadius: "8px",
        boxShadow: "0px 0px 2px rgba(20,20,20,0.12)",
      }}
    >
      {/* CONTENT */}
      <Box
        sx={{
          height: 436,
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          overflowY: "auto",
        }}
      >
        {/* HEADING (TOP ALIGNED) */}
        <Typography
          fontSize={18}
          fontWeight={600}
          color="#141414"
          sx={{ mb: "12px" }}
        >
          Alert Box
        </Typography>

        <AlertAccordion
          title="Absent labor"
          count={6}
          isOpen={openKey === "absent"}
          onToggle={() => toggle("absent")}
          type="absent"
          items={[
            { name: "John Doe", meta: "4 days absent in this month" },
            { name: "Alex Smith", meta: "4 days absent in this month" },
            { name: "Rahul Kumar", meta: "4 days absent in this month" },
            { name: "Ravi Patel", meta: "4 days absent in this month" },
            { name: "Aman Verma", meta: "4 days absent in this month" },
            { name: "Karan Singh", meta: "4 days absent in this month" },
          ]}
        />

        <AlertAccordion
          title="Tax payment"
          count={3}
          isOpen={openKey === "tax"}
          onToggle={() => toggle("tax")}
          type="tax"
          items={[
            { name: "ABC Pvt Ltd", meta: "5 days remaining to pay tax" },
            { name: "Zen Corp", meta: "5 days remaining to pay tax" },
            { name: "Nova LLC", meta: "5 days remaining to pay tax" },
          ]}
        />

        <AlertAccordion
          title="Passport expire"
          count={1}
          isOpen={openKey === "passport"}
          onToggle={() => toggle("passport")}
          type="passport"
          items={[
            {
              name: "Michael Scott",
              meta: "After 1 month passport is expire",
            },
          ]}
        />
      </Box>
    </Box>
  );
}

export default AlertBox;
