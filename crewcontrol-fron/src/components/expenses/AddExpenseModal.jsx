import { useState, useEffect } from "react";
import { employeesApi } from '../../api/employees'

const BORDER = "var(--border-card)";
const DARK   = "var(--text-primary)";
const GRAY   = "var(--text-secondary)";
const BLUE   = "var(--color-primary)";

const baseInput = {
  width: "100%",
  height: 44,
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: BORDER,
  borderRadius: 8,
  padding: "0 12px",
  fontSize: 14,
  color: DARK,
  background: "#fff",
  outline: "none",
  appearance: "none",
  WebkitAppearance: "none",
  fontFamily: "inherit",
  boxSizing: "border-box",
};

const dropArrow =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236B7280' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\")";

const EXPENSE_TYPES = ["Advance", "Gas", "Other", "Penalty Amount"];

function FInput({ value, onChange, placeholder, readOnly, style }) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      readOnly={readOnly}
      style={{
        ...baseInput,
        ...(focused ? { borderColor: BLUE, boxShadow: "0 0 0 3px rgba(44,95,234,0.10)" } : {}),
        ...(readOnly ? { background: "var(--bg-surface)", color: GRAY } : {}),
        ...style,
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    />
  );
}

function FSelect({ value, onChange }) {
  const [focused, setFocused] = useState(false);
  return (
    <select
      value={value}
      onChange={onChange}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        ...baseInput,
        backgroundImage: dropArrow,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 12px center",
        paddingRight: 32,
        cursor: "pointer",
        ...(focused ? { borderColor: BLUE, boxShadow: "0 0 0 3px rgba(44,95,234,0.10)" } : {}),
      }}
    >
      {EXPENSE_TYPES.map((t) => (
        <option key={t} value={t}>{t}</option>
      ))}
    </select>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <label style={{ fontSize: 14, color: DARK, fontWeight: 500 }}>{label}</label>
      {children}
    </div>
  );
}

function UnitInput({ prefix, value, onChange }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{
      ...baseInput,
      display: "flex", alignItems: "center", gap: 6,
      ...(focused ? { borderColor: BLUE, boxShadow: "0 0 0 3px rgba(44,95,234,0.10)" } : {}),
    }}>
      <span style={{ fontSize: 14, color: GRAY, flexShrink: 0 }}>{prefix}</span>
      <input
        type="number"
        value={value}
        onChange={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          flex: 1, minWidth: 0, border: "none", outline: "none",
          background: "transparent", fontSize: 14, color: DARK,
          fontFamily: "inherit", padding: 0,
          appearance: "textfield", WebkitAppearance: "none", MozAppearance: "textfield",
        }}
      />
    </div>
  );
}

export default function AddExpenseModal({ open, onClose, onSubmit, prefillEmployee }) {
  const [form, setForm] = useState({
    employeeId: prefillEmployee?._id || prefillEmployee?.id || "",
    employeeName: prefillEmployee?.name ?? "",
    emiratesId:   prefillEmployee?.emiratesId ?? "",
    trade: prefillEmployee?.trade || "",
    rateHr: prefillEmployee?.rateHr || 0,
    totalPresent: 0,
    totalHoursWorked: 0,
    expenseType:  "Advance",
    otherDescription: "",
    amount:       "",
  });

  const [employees, setEmployees] = useState([]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const resp = await employeesApi.getEmployees({ page: 1, limit: 500 });
        const list = Array.isArray(resp?.data?.data) ? resp.data.data : Array.isArray(resp?.data?.employees) ? resp.data.employees : [];
        if (!active) return;
        setEmployees(list);
      } catch (err) {
        // ignore
      }
    };
    load();
    return () => { active = false };
  }, []);

  // Reset to fresh state if prefill changes (e.g. different rows)
  const [lastPrefill, setLastPrefill] = useState(prefillEmployee);
  if (prefillEmployee !== lastPrefill) {
    setLastPrefill(prefillEmployee);
    setForm((f) => ({
      ...f,
      employeeId: prefillEmployee?._id || prefillEmployee?.id || "",
      employeeName: prefillEmployee?.name ?? "",
      emiratesId: prefillEmployee?.emiratesId ?? "",
    }));
  }

  if (!open) return null;

  const isOther = form.expenseType === "Other";

  const handleExpenseTypeChange = (e) => {
    const value = e.target.value;
    setForm((p) => ({
      ...p,
      expenseType: value,
      // Clear the free-text description if the user switches away from "Other"
      otherDescription: value === "Other" ? p.otherDescription : "",
    }));
  };

  // Label shown on the submit button and (optionally) sent to the API —
  // falls back to "Other" until the user types a custom description.
  const expenseLabel = isOther ? (form.otherDescription.trim() || "Other") : form.expenseType;

  const handleSubmit = () => {
    // TODO: wire to API
    onSubmit?.({ ...form, expenseLabel });
    onClose();
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(17,24,39,0.40)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24, zIndex: 1400,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 560,
          background: "#fff", borderRadius: 12,
          boxShadow: "0 24px 80px rgba(0,0,0,0.15)",
          overflow: "hidden",
        }}
      >
        {/* Title bar */}
        <div style={{
          padding: "20px 24px 16px",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          borderBottom: `1px solid ${BORDER}`,
        }}>
          <span style={{ fontSize: 17, fontWeight: 600, color: DARK }}>
            Add Expense Amount
          </span>
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, border: "none", background: "transparent",
              borderRadius: "50%", cursor: "pointer", color: GRAY,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 20, fontFamily: "inherit",
            }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: 18 }}>
          <Field label="Employee Name">
            <select
              value={form.employeeId}
              onChange={async (e) => {
                const id = e.target.value;
                setForm((p) => ({ ...p, employeeId: id }));
                if (!id) return;
                try {
                  const resp = await employeesApi.getEmployee(id);
const emp =
  resp?.data?.data ||
  resp?.data?.employee ||
  resp?.data ||
  {};
                    const fullName = emp.name || `${emp.firstName||''} ${emp.lastName||''}`.trim();
setForm((p) => ({
  ...p,
  employeeId: id,
  employeeName: fullName,
  emiratesId:
    emp.emiratesId ||
    emp.employeeId ||
    "",
  trade:
    emp.trade ||
    emp.position ||
    "",
  rateHr:
    emp.ratePerHour ||
    emp.rateHr ||
    emp.hourlyRate ||
    emp.rate ||
    0,
}));

                  // fetch attendance totals
                  
                  try {
                    const attResp = await employeesApi.getEmployeeAttendance(id);
                    const items = Array.isArray(attResp?.data?.data) ? attResp.data.data : Array.isArray(attResp?.data) ? attResp.data : [];
                    let totalDays = 0;
                    let totalHours = 0;
                    items.forEach((it) => {
                      const status = String(it.status || '').toLowerCase();
                      if (status === 'present') totalDays += 1;
                      else if (status === 'half-day' || status === 'half') totalDays += 0.5;
                      if (typeof it.hoursWorked === 'number') totalHours += Number(it.hoursWorked || 0);
                    });
                    setForm((p) => ({ ...p, totalPresent: totalDays, totalHoursWorked: Math.round(totalHours) }));
                  } catch (err) {
                    // ignore attendance
                  }
                } catch (err) {
                  // ignore
                }
              }}
              style={{ ...baseInput, backgroundImage: dropArrow, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', paddingRight: 32, cursor: 'pointer' }}
            >
              <option value="">Select employee</option>
              {employees.map((emp) => (
                <option key={emp._id || emp.id} value={emp._id || emp.id}>{emp.name || `${emp.firstName || ''} ${emp.lastName || ''}`.trim()}</option>
              ))}
            </select>
          </Field>

          <Field label="Emirates ID">
            <FInput
              value={form.emiratesId}
              onChange={(e) => setForm((p) => ({ ...p, emiratesId: e.target.value }))}
              placeholder="Enter Emirates ID"
            />
          </Field>

          {isOther ? (
            <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
              <div style={{ flex: "0 0 140px" }}>
                <Field label="Expense Type">
                  <FSelect value={form.expenseType} onChange={handleExpenseTypeChange} />
                </Field>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Field label="Specify Type">
                  <FInput
                    value={form.otherDescription}
                    onChange={(e) => setForm((p) => ({ ...p, otherDescription: e.target.value }))}
                    placeholder="e.g. Food, Travel, Tools"
                  />
                </Field>
              </div>
              <div style={{ flex: "0 0 130px" }}>
                <Field label="Amount">
                  <UnitInput
                    prefix="AED"
                    value={form.amount}
                    onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
                  />
                </Field>
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <Field label="Expense Type">
                <FSelect value={form.expenseType} onChange={handleExpenseTypeChange} />
              </Field>
              <Field label="Amount">
                <UnitInput
                  prefix="AED"
                  value={form.amount}
                  onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
                />
              </Field>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "16px 24px",
          borderTop: `1px solid ${BORDER}`,
          display: "flex", justifyContent: "flex-end",
        }}>
          <button
            onClick={handleSubmit}
            style={{
              height: 40, padding: "0 28px",
              background: BLUE, color: "#fff", border: "none",
              borderRadius: 8, fontSize: 14, fontWeight: 500,
              cursor: "pointer", fontFamily: "inherit",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.88")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
          >
            Add {expenseLabel}
          </button>
        </div>
      </div>
    </div>
  );
}