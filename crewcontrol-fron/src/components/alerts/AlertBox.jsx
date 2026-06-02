import { Box, Typography } from "@mui/material";
import { useState } from "react";
import AlertAccordion from "./AlertAccordion";

function AlertBox({ alerts }) {
  const [openKey, setOpenKey] = useState(null);

  const absentWorkers = Array.isArray(alerts?.absentWorkers) ? alerts.absentWorkers : [];
  const payments = Array.isArray(alerts?.payments) ? alerts.payments : [];
  const taxPayments = Array.isArray(alerts?.taxPayments) ? alerts.taxPayments : [];
  const passportExpiring = Array.isArray(alerts?.documentExpiring) ? alerts.documentExpiring : [];
  const siteFinished = Array.isArray(alerts?.siteFinished) ? alerts.siteFinished : [];

  const toggle = (key) => setOpenKey((prev) => (prev === key ? null : key));

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
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        overflowY: "auto",
        scrollbarGutter: "stable",
        scrollbarWidth: "thin",
        scrollbarColor: "#C7CDD8 transparent",
        "&::-webkit-scrollbar": {
          width: 6,
        },
        "&::-webkit-scrollbar-thumb": {
          backgroundColor: "#C7CDD8",
          borderRadius: "999px",
        },
        "&::-webkit-scrollbar-track": {
          backgroundColor: "transparent",
        },
      }}
    >
      <Typography fontSize={18} fontWeight={600} color="#141414">
        Alert Box
      </Typography>

      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        <AlertAccordion
          title="Absent worker"
          count={absentWorkers.length}
          isOpen={openKey === "absent"}
          onToggle={() => toggle("absent")}
          type="absent"
          items={absentWorkers}
        />

        <AlertAccordion
          title="Payment"
          count={payments.length}
          isOpen={openKey === "payment"}
          onToggle={() => toggle("payment")}
          type="payment"
          items={payments}
        />

        <AlertAccordion
          title="Tax Payment"
          count={taxPayments.length}
          isOpen={openKey === "tax"}
          onToggle={() => toggle("tax")}
          type="tax"
          items={taxPayments}
        />

        <AlertAccordion
          title="Document Expiring"
          count={passportExpiring.length}
          isOpen={openKey === "document-expiring"}
          onToggle={() => toggle("document-expiring")}
          type="document"
          items={passportExpiring}
        />

        <AlertAccordion
          title="Site Finished"
          count={siteFinished.length}
          isOpen={openKey === "site-finished"}
          onToggle={() => toggle("site-finished")}
          type="site"
          items={siteFinished}
        />
      </Box>
    </Box>
  );
}

export default AlertBox;
