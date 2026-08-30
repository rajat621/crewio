import { memo, useEffect, useState } from "react";
import { employeesApi } from "../../api/employees";
import { useActiveClientCompanies } from "../../hooks/useActiveClientCompanies";
import SearchableSelect from "../common/SearchableSelect";

/**
 * The same "Assign to Company" popup already used on the Employees page's
 * Assigned tab (pick a company for one specific employee), pulled out into
 * a standalone component so Smart Alerts' "Assign" button can open the
 * exact same flow instead of just linking off to a profile page.
 */
function AssignToCompanyDialog({ open, employee, onClose, onAssigned }) {
  // Phase 3.12: was its own useState/useEffect fetch duplicating
  // useActiveClientCompanies' exact logic (same endpoint, same fallback,
  // same filter, same {id,name} shape) - every dialog open re-fetched
  // from scratch even when Employees.jsx/AddEmployee.jsx had already
  // populated this exact cache entry moments earlier. enabled={open}
  // preserves the original's "only fetch when the dialog is actually
  // open" timing exactly, rather than fetching unconditionally on the
  // (always-mounted) component's mount.
  const { data: companies = [] } = useActiveClientCompanies(open);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [isAssigning, setIsAssigning] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setSelectedCompanyId("");
    setError("");
  }, [open]);

  if (!open) return null;

  const handleClose = () => {
    if (isAssigning) return;
    onClose?.();
  };

  const handleAssign = async () => {
    if (!employee?.id || !selectedCompanyId) return;
    setIsAssigning(true);
    setError("");
    try {
      await employeesApi.assignEmployee(employee.id, selectedCompanyId);
      onAssigned?.();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to assign employee. Please try again.");
    } finally {
      setIsAssigning(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.20)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "24px",
      }}
      onClick={handleClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "808px",
          minHeight: "500px",
          background: "#fff",
          border: "1px solid var(--border-card)",
          borderRadius: "8px",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          style={{
            height: "64px",
            borderBottom: "1px solid var(--border-card)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 18px",
          }}
        >
          <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 600, color: "var(--text-primary)", letterSpacing: "0.54px", lineHeight: "20px" }}>
            Assign {employee?.name || "Employee"} to Company
          </h3>
          <button
            type="button"
            onClick={handleClose}
            style={{
              border: "none",
              background: "transparent",
              color: "#374151",
              fontSize: "28px",
              lineHeight: 1,
              cursor: "pointer",
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: "24px 20px", flex: 1 }}>
          <label style={{ display: "block", fontSize: "14px", color: "var(--text-primary)", marginBottom: "12px", fontWeight: 400 }}>
            Select a company
          </label>
          <SearchableSelect
            options={companies.map((company) => ({ value: company.id, label: company.name }))}
            value={selectedCompanyId}
            onChange={setSelectedCompanyId}
            placeholder="Select or type to search"
            style={{ maxWidth: "560px" }}
          />
          {error ? (
            <div style={{ marginTop: "12px", color: "#B91C1C", fontSize: "13px" }}>{error}</div>
          ) : null}
        </div>

        <div
          style={{
            borderTop: "1px solid var(--border-card)",
            height: "68px",
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            padding: "0 20px",
          }}
        >
          <button
            type="button"
            onClick={handleAssign}
            disabled={!selectedCompanyId || isAssigning}
            style={{
              minWidth: "71px",
              height: "32px",
              borderRadius: "8px",
              border: "none",
              padding: "0 16px",
              fontSize: "12px",
              fontWeight: 500,
              color: "#fff",
              background: !selectedCompanyId || isAssigning ? "var(--text-disabled)" : "var(--color-primary)",
              cursor: !selectedCompanyId || isAssigning ? "not-allowed" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {isAssigning ? "Assigning..." : "Assign"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default memo(AssignToCompanyDialog);