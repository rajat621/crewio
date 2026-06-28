import { Box, Typography } from "@mui/material";
import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AlertAccordion from "./AlertAccordion";

<<<<<<< HEAD
function asList(value) {
  return Array.isArray(value) ? value : [];
}

function withFallbackMeta(items, fallbackMeta) {
  return items.map((item) => ({
    ...item,
    meta: item?.meta || fallbackMeta,
  }));
}

function splitDocumentAlerts(items) {
  const passport = [];
  const emirates = [];

  items.forEach((item) => {
    const name = String(item?.name || "");
    const normalized = name.toLowerCase();
    if (normalized.includes("passport")) {
      passport.push({
        ...item,
        name: name.replace(/'?s?\s*passport\s*is\s*expiring\s*soon/i, "").trim() || name,
        meta: item?.meta || "Expiring soon",
      });
    } else if (normalized.includes("emirates") || normalized.includes("emirate")) {
      emirates.push({
        ...item,
        name: name.replace(/'?s?\s*emirates?\s*id\s*is\s*expiring\s*soon/i, "").trim() || name,
        meta: item?.meta || "Expiring soon",
      });
    } else {
      passport.push(item);
    }
  });

  return { passport, emirates };
}

function AlertBox({ alerts }) {
  const navigate = useNavigate();
  const [openKey, setOpenKey] = useState(null);

  const getEmployeeId = useCallback((item) => {
    const raw =
      item?.employeeId ||
      item?.employee?._id ||
      item?.employee ||
      item?.id ||
      item?._id ||
      "";
    return typeof raw === "object" ? raw?._id || raw?.id || "" : raw;
  }, []);

  const getInitials = useCallback((name) =>
    String(name || "")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "EM", []);

  const openEmployeeProfile = useCallback((item) => {
    const employeeId = getEmployeeId(item);
    if (employeeId) {
      navigate(`/employees/${employeeId}`);
    }
  }, [getEmployeeId, navigate]);

  const openEmployeeChat = useCallback((item) => {
    const employeeId = getEmployeeId(item);
    if (!employeeId) return;

    navigate("/chat", {
      state: {
        selectedChat: {
          id: employeeId,
          name: item?.name || "Employee",
          avatar: getInitials(item?.name),
          unread: 0,
        },
      },
    });
  }, [getEmployeeId, getInitials, navigate]);

  const openTaxInvoiceGenerate = useCallback((item) => {
    const companyId = item?.companyId || item?.company || item?.id || "";
    navigate(companyId ? `/tax-invoices/generate?companyId=${companyId}` : "/tax-invoices/generate");
  }, [navigate]);

  const groupedAlerts = useMemo(() => {
    const absentWorkers = asList(alerts?.absentWorkers);
    const payments = asList(alerts?.payments);
    const taxPayments = asList(alerts?.taxPayments);
    const documentExpiring = asList(alerts?.documentExpiring);
    const siteFinished = asList(alerts?.siteFinished);
    const availableWorkers = asList(alerts?.availableWorkers);
    const salarySlips = asList(alerts?.salarySlips);
    const documents = splitDocumentAlerts(documentExpiring);

    const dailySections = [
      {
        title: "Absent Today",
        actionLabel: "Chat",
        items: withFallbackMeta(absentWorkers, "Absent today"),
        onAction: openEmployeeChat,
      },
      {
        title: "Available Workers",
        actionLabel: "Assign",
        items: availableWorkers,
      },
      {
        title: "Worker Site-Over",
        actionLabel: "Start",
        items: siteFinished,
      },
    ];

    const payrollSections = [
      {
        title: "Tax Invoice",
        actionLabel: "Generate",
        items: taxPayments,
        onAction: openTaxInvoiceGenerate,
      },
      {
        title: "Salary Slip",
        actionLabel: "Create",
        items: payments.length ? payments : salarySlips,
      },
    ];

    const documentSections = [
      {
        title: "Passport Expiring",
        actionLabel: "Update",
        items: documents.passport,
        onAction: openEmployeeProfile,
      },
      {
        title: "Emirates ID Expiring",
        actionLabel: "Update",
        items: documents.emirates,
        onAction: openEmployeeProfile,
      },
    ];

    return [
      {
        key: "daily-workforce-status",
        title: "Daily Workforce Status",
        count: dailySections.reduce((total, section) => total + section.items.length, 0),
        sections: dailySections,
      },
      {
        key: "payroll-taxes",
        title: "Payroll & Taxes",
        count: payrollSections.reduce((total, section) => total + section.items.length, 0),
        sections: payrollSections,
      },
      {
        key: "document-expiring",
        title: "Document Expiring",
        count: documentSections.reduce((total, section) => total + section.items.length, 0),
        sections: documentSections,
      },
    ];
  }, [alerts, openEmployeeChat, openEmployeeProfile, openTaxInvoiceGenerate]);
=======
function AlertBox({ alerts }) {
  const [openKey, setOpenKey] = useState(null);

  const absentWorkers = Array.isArray(alerts?.absentWorkers) ? alerts.absentWorkers : [];
  const payments = Array.isArray(alerts?.payments) ? alerts.payments : [];
  const taxPayments = Array.isArray(alerts?.taxPayments) ? alerts.taxPayments : [];
  const passportExpiring = Array.isArray(alerts?.documentExpiring) ? alerts.documentExpiring : [];
  const siteFinished = Array.isArray(alerts?.siteFinished) ? alerts.siteFinished : [];
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0

  const toggle = (key) => setOpenKey((prev) => (prev === key ? null : key));

  return (
    <Box
      sx={{
        width: "100%",
        height: 476,
        px: "16px",
        py: "20px",
        backgroundColor: "var(--bg-surface)",
        border: "1px solid var(--border-card)",
        borderRadius: "8px",
        boxShadow: "0px 0px 2px rgba(20,20,20,0.12)",
        display: "flex",
        flexDirection: "column",
<<<<<<< HEAD
        gap: "16px",
=======
        gap: "12px",
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
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
<<<<<<< HEAD
      <Typography fontSize={18} fontWeight={600} color="#27243A">
        Smart Alerts
=======
      <Typography fontSize={18} fontWeight={600} color="#141414">
        Alert Box
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
      </Typography>

      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
<<<<<<< HEAD
        {groupedAlerts.map((group) => (
          <AlertAccordion
            key={group.key}
            title={group.title}
            count={group.count}
            isOpen={openKey === group.key}
            onToggle={() => toggle(group.key)}
            sections={group.sections}
          />
        ))}
=======
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
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
      </Box>
    </Box>
  );
}

export default AlertBox;

