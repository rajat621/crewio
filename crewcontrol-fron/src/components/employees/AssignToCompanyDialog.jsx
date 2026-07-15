import { useEffect, useState } from "react";
import { companiesApi } from "../../api/companies";
import { employeesApi } from "../../api/employees";

/**
 * The same "Assign to Company" popup already used on the Employees page's
 * Assigned tab (pick a company for one specific employee), pulled out into
 * a standalone component so Smart Alerts' "Assign" button can open the
 * exact same flow instead of just linking off to a profile page.
 */
export default function AssignToCompanyDialog({ open, employee, onClose, onAssigned }) {
  const [companies, setCompanies] = useState([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [isAssigning, setIsAssigning] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setSelectedCompanyId("");
    setError("");

    let active = true;

    const loadCompanies = async () => {
      try {
        let rows = [];
        try {
          const response = await companiesApi.getClientCompanies({ page: 1, limit: 500 });
          rows = Array.isArray(response?.data?.data)
            ? response.data.data
            : Array.isArray(response?.data?.companies)
              ? response.data.companies
              : [];
        } catch (err) {
          const fallbackResponse = await companiesApi.getCompanies({ page: 1, limit: 500 });
          rows = Array.isArray(fallbackResponse?.data?.data)
            ? fallbackResponse.data.data
            : Array.isArray(fallbackResponse?.data?.companies)
              ? fallbackResponse.data.companies
              : [];
        }

        const mapped = rows
          .filter(
            (company) =>
              (company?.companyRole || "client") === "client" &&
              String(company?.status || "active").toLowerCase() === "active"
          )
          .map((company) => ({
            id: company?._id,
            name: company?.name || "Unnamed company",
          }))
          .filter((company) => company.id);

        if (active) setCompanies(mapped);
      } catch (err) {
        if (active) setCompanies([]);
      }
    };

    loadCompanies();

    return () => {
      active = false;
    };
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
          <select
            className="assign-company-select"
            value={selectedCompanyId}
            onChange={(event) => setSelectedCompanyId(event.target.value)}
            style={{
              width: "100%",
              maxWidth: "560px",
              height: "44px",
              borderRadius: "8px",
              padding: "0 40px 0 14px",
              fontSize: "14px",
              color: "var(--text-primary)",
              background: "#fff",
              fontFamily: "inherit",
              appearance: "none",
              WebkitAppearance: "none",
              MozAppearance: "none",
              backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 20 20' fill='none'><path d='M5 7L10 12L15 7' stroke='%23141414' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/></svg>")`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 12px center",
              backgroundSize: "12px",
            }}
          >
            <option value="">Select company</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
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