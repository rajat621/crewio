// import { Box, Typography } from "@mui/material";
// import { useCallback, useMemo, useState } from "react";
// import { useNavigate } from "react-router-dom";
// import AlertAccordion from "./AlertAccordion";

// function asList(value) {
//   return Array.isArray(value) ? value : [];
// }

// function withFallbackMeta(items, fallbackMeta) {
//   return items.map((item) => ({
//     ...item,
//     meta: item?.meta || fallbackMeta,
//   }));
// }

// function splitDocumentAlerts(items) {
//   const passport = [];
//   const emirates = [];

//   items.forEach((item) => {
//     const name = String(item?.name || "");
//     const normalized = name.toLowerCase();
//     if (normalized.includes("passport")) {
//       passport.push({
//         ...item,
//         name: name.replace(/'?s?\s*passport\s*is\s*expiring\s*soon/i, "").trim() || name,
//         meta: item?.meta || "Expiring soon",
//       });
//     } else if (normalized.includes("emirates") || normalized.includes("emirate")) {
//       emirates.push({
//         ...item,
//         name: name.replace(/'?s?\s*emirates?\s*id\s*is\s*expiring\s*soon/i, "").trim() || name,
//         meta: item?.meta || "Expiring soon",
//       });
//     } else {
//       passport.push(item);
//     }
//   });

//   return { passport, emirates };
// }

// function AlertBox({ alerts }) {
//   const navigate = useNavigate();
//   const [openKey, setOpenKey] = useState(null);

//   const getEmployeeId = useCallback((item) => {
//     const raw =
//       item?.employeeId ||
//       item?.employee?._id ||
//       item?.employee ||
//       item?.id ||
//       item?._id ||
//       "";
//     return typeof raw === "object" ? raw?._id || raw?.id || "" : raw;
//   }, []);

//   const getInitials = useCallback((name) =>
//     String(name || "")
//       .split(" ")
//       .filter(Boolean)
//       .slice(0, 2)
//       .map((part) => part[0]?.toUpperCase())
//       .join("") || "EM", []);

//   const openEmployeeProfile = useCallback((item) => {
//     const employeeId = getEmployeeId(item);
//     if (employeeId) {
//       navigate(`/employees/${employeeId}`);
//     }
//   }, [getEmployeeId, navigate]);

//   const openEmployeeChat = useCallback((item) => {
//     const employeeId = getEmployeeId(item);
//     if (!employeeId) return;

//     navigate("/chat", {
//       state: {
//         selectedChat: {
//           id: employeeId,
//           name: item?.name || "Employee",
//           avatar: getInitials(item?.name),
//           unread: 0,
//         },
//       },
//     });
//   }, [getEmployeeId, getInitials, navigate]);

//   const openTaxInvoiceGenerate = useCallback((item) => {
//     const companyId = item?.companyId || item?.company || item?.id || "";
//     navigate(companyId ? `/tax-invoices/generate?companyId=${companyId}` : "/tax-invoices/generate");
//   }, [navigate]);

//   const groupedAlerts = useMemo(() => {
//     const absentWorkers = asList(alerts?.absentWorkers);
//     const payments = asList(alerts?.payments);
//     const taxPayments = asList(alerts?.taxPayments);
//     const documentExpiring = asList(alerts?.documentExpiring);
//     const siteFinished = asList(alerts?.siteFinished);
//     const availableWorkers = asList(alerts?.availableWorkers);
//     const salarySlips = asList(alerts?.salarySlips);
//     const documents = splitDocumentAlerts(documentExpiring);

//     const dailySections = [
//       {
//         title: "Absent Today",
//         actionLabel: "Chat",
//         items: withFallbackMeta(absentWorkers, "Absent today"),
//         onAction: openEmployeeChat,
//       },
//       {
//         title: "Available Workers",
//         actionLabel: "Assign",
//         items: availableWorkers,
//       },
//       {
//         title: "Worker Site-Over",
//         actionLabel: "Start",
//         items: siteFinished,
//       },
//     ];

//     const payrollSections = [
//       {
//         title: "Tax Invoice",
//         actionLabel: "Generate",
//         items: taxPayments,
//         onAction: openTaxInvoiceGenerate,
//       },
//       {
//         title: "Salary Slip",
//         actionLabel: "Create",
//         items: payments.length ? payments : salarySlips,
//       },
//     ];

//     const documentSections = [
//       {
//         title: "Passport Expiring",
//         actionLabel: "Update",
//         items: documents.passport,
//         onAction: openEmployeeProfile,
//       },
//       {
//         title: "Emirates ID Expiring",
//         actionLabel: "Update",
//         items: documents.emirates,
//         onAction: openEmployeeProfile,
//       },
//     ];

//     return [
//       {
//         key: "daily-workforce-status",
//         title: "Daily Workforce Status",
//         count: dailySections.reduce((total, section) => total + section.items.length, 0),
//         sections: dailySections,
//       },
//       {
//         key: "payroll-taxes",
//         title: "Payroll & Taxes",
//         count: payrollSections.reduce((total, section) => total + section.items.length, 0),
//         sections: payrollSections,
//       },
//       {
//         key: "document-expiring",
//         title: "Document Expiring",
//         count: documentSections.reduce((total, section) => total + section.items.length, 0),
//         sections: documentSections,
//       },
//     ];
//   }, [alerts, openEmployeeChat, openEmployeeProfile, openTaxInvoiceGenerate]);

//   const toggle = (key) => setOpenKey((prev) => (prev === key ? null : key));

//   return (
//     <Box
//       sx={{
//         width: "100%",
//         height: 476,
//         px: "16px",
//         py: "20px",
//         backgroundColor: "var(--bg-surface)",
//         border: "1px solid var(--border-card)",
//         borderRadius: "8px",
//         boxShadow: "0px 0px 2px rgba(20,20,20,0.12)",
//         display: "flex",
//         flexDirection: "column",
//         gap: "16px",
//         overflowY: "auto",
//         scrollbarGutter: "stable",
//         scrollbarWidth: "thin",
//         scrollbarColor: "#C7CDD8 transparent",
//         "&::-webkit-scrollbar": {
//           width: 6,
//         },
//         "&::-webkit-scrollbar-thumb": {
//           backgroundColor: "#C7CDD8",
//           borderRadius: "999px",
//         },
//         "&::-webkit-scrollbar-track": {
//           backgroundColor: "transparent",
//         },
//       }}
//     >
//       <Typography fontSize={18} fontWeight={600} color="#27243A">
//         Smart Alerts
//       </Typography>

//       <Box
//         sx={{
//           display: "flex",
//           flexDirection: "column",
//           gap: "12px",
//         }}
//       >
//         {groupedAlerts.map((group) => (
//           <AlertAccordion
//             key={group.key}
//             title={group.title}
//             count={group.count}
//             isOpen={openKey === group.key}
//             onToggle={() => toggle(group.key)}
//             sections={group.sections}
//           />
//         ))}
//       </Box>
//     </Box>
//   );
// }

// export default AlertBox;

import { Box, Typography } from "@mui/material";
import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AlertAccordion from "./AlertAccordion";
import AssignToCompanyDialog from "../employees/AssignToCompanyDialog";
import { employeesApi } from "../../api/employees";

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

function AlertBox({ alerts, onRefresh }) {
  const navigate = useNavigate();
  const [openKey, setOpenKey] = useState(null);
  const [assignTarget, setAssignTarget] = useState(null);
  const [reactivatingId, setReactivatingId] = useState(null);
  const [actionError, setActionError] = useState("");

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

  const openSalarySlipGenerate = useCallback(() => {
    navigate("/salary-slip/generate");
  }, [navigate]);

  // "Assign" on Available Workers opens the exact same "Assign to Company"
  // popup used on the Employees page's Assigned tab, instead of just
  // linking off to the employee's profile.
  const openAssignDialog = useCallback((item) => {
    const employeeId = getEmployeeId(item);
    if (!employeeId) return;
    setActionError("");
    setAssignTarget({ id: employeeId, name: item?.name || "Employee" });
  }, [getEmployeeId]);

  const handleAssignDialogClose = useCallback(() => {
    setAssignTarget(null);
  }, []);

  const handleAssignDialogAssigned = useCallback(() => {
    setAssignTarget(null);
    onRefresh?.();
  }, [onRefresh]);

  // "Start" on Worker Site-Over reactivates the employee back onto their
  // prior company (see employeesApi.reactivateEmployee /
  // reactivateEmployee in employee.controller.js), which flips
  // assignedStatus from 'site-over' back to 'on-site' - so this item
  // actually moves out of "Worker Site-Over" once the alerts refresh,
  // rather than just navigating somewhere.
  const handleReactivate = useCallback(async (item) => {
    const employeeId = getEmployeeId(item);
    if (!employeeId) return;

    setActionError("");
    setReactivatingId(employeeId);
    try {
      await employeesApi.reactivateEmployee(employeeId);
      onRefresh?.();
    } catch (err) {
      setActionError(
        err?.response?.data?.message || `Failed to restart ${item?.name || "this employee"}. Please try again.`
      );
    } finally {
      setReactivatingId(null);
    }
  }, [getEmployeeId, onRefresh]);

  const groupedAlerts = useMemo(() => {
    const absentWorkers = asList(alerts?.absentWorkers);
    const onLeaveWorkers = asList(alerts?.onLeaveWorkers);
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
        title: "On Leave",
        actionLabel: "Chat",
        items: withFallbackMeta(onLeaveWorkers, "On leave"),
        onAction: openEmployeeChat,
      },
      {
        title: "Available Workers",
        actionLabel: "Assign",
        items: availableWorkers,
        onAction: openAssignDialog,
      },
      {
        title: "Worker Site-Over",
        actionLabel: "Start",
        busyLabel: "Starting...",
        items: siteFinished,
        onAction: handleReactivate,
        isItemBusy: (item) => reactivatingId && reactivatingId === getEmployeeId(item),
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
        onAction: openSalarySlipGenerate,
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
  }, [
    alerts,
    openEmployeeChat,
    openEmployeeProfile,
    openTaxInvoiceGenerate,
    openSalarySlipGenerate,
    openAssignDialog,
    handleReactivate,
    reactivatingId,
    getEmployeeId,
  ]);

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
        gap: "16px",
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
      <Typography fontSize={18} fontWeight={600} color="#27243A">
        Smart Alerts
      </Typography>

      {actionError ? (
        <Typography sx={{ fontSize: 12.5, color: "#B91C1C" }}>{actionError}</Typography>
      ) : null}

      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
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
      </Box>

      <AssignToCompanyDialog
        open={Boolean(assignTarget)}
        employee={assignTarget}
        onClose={handleAssignDialogClose}
        onAssigned={handleAssignDialogAssigned}
      />
    </Box>
  );
}

export default AlertBox;