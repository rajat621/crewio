import { useEffect, useState } from "react";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";

dayjs.extend(customParseFormat);

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

function Field({ label, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <label style={{ fontSize: 14, color: DARK, fontWeight: 500 }}>{label}</label>
      {children}
    </div>
  );
}

function FInput({ value, onChange, placeholder }) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      style={{
        ...baseInput,
        ...(focused ? { borderColor: BLUE, boxShadow: "0 0 0 3px rgba(44,95,234,0.10)" } : {}),
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    />
  );
}

function UnitInput({ prefix, value, onChange }) {
  const [focused, setFocused] = useState(false);
  return (
    <div
      style={{
        ...baseInput,
        display: "flex",
        alignItems: "center",
        gap: 6,
        ...(focused ? { borderColor: BLUE, boxShadow: "0 0 0 3px rgba(44,95,234,0.10)" } : {}),
      }}
    >
      <span style={{ fontSize: 14, color: GRAY, flexShrink: 0 }}>{prefix}</span>
      <input
        type="number"
        value={value}
        onChange={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          flex: 1,
          minWidth: 0,
          border: "none",
          outline: "none",
          background: "transparent",
          fontSize: 14,
          color: DARK,
          fontFamily: "inherit",
          padding: 0,
          appearance: "textfield",
          WebkitAppearance: "none",
          MozAppearance: "textfield",
        }}
      />
    </div>
  );
}

const EMPTY_FORM = { name: "", date: "", amount: "" };

export default function AddCompanyExpenseModal({ open, onClose, onSubmit, initialValues, submitLabel = "Add Expense" }) {
  const [form, setForm] = useState(EMPTY_FORM);

  // Reset (or prefill for edit) every time the modal opens.
  useEffect(() => {
    if (!open) return;
    setForm(
      initialValues
        ? {
            name: initialValues.name || "",
            date: initialValues.date || "",
            amount: initialValues.amount ?? "",
          }
        : EMPTY_FORM
    );
  }, [open, initialValues]);

  if (!open) return null;

  const handleSubmit = () => {
    onSubmit?.(form);
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(17,24,39,0.40)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        zIndex: 1400,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 480,
          background: "#fff",
          borderRadius: 12,
          boxShadow: "0 24px 80px rgba(0,0,0,0.15)",
          overflow: "hidden",
        }}
      >
        {/* Title bar */}
        <div
          style={{
            padding: "20px 24px 16px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom: `1px solid ${BORDER}`,
          }}
        >
          <span style={{ fontSize: 17, fontWeight: 600, color: DARK }}>Add Expense Amount</span>
          <button
            onClick={onClose}
            style={{
              width: 28,
              height: 28,
              border: "none",
              background: "transparent",
              borderRadius: "50%",
              cursor: "pointer",
              color: GRAY,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 20,
              fontFamily: "inherit",
            }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: 18 }}>
          <Field label="Expense Name">
            <FInput
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Travel, Groceries, Office Rent"
            />
          </Field>

          <Field label="Date">
            <LocalizationProvider dateAdapter={AdapterDayjs}>
              <DatePicker
                format="DD/MM/YYYY"
                value={form.date ? dayjs(form.date, "DD/MM/YYYY") : null}
                onChange={(newValue) =>
                  setForm((p) => ({ ...p, date: newValue ? newValue.format("DD/MM/YYYY") : "" }))
                }
                slotProps={{
                  textField: {
                    fullWidth: true,
                    placeholder: "DD/MM/YYYY",
                    sx: {
                      "& .MuiOutlinedInput-root": {
                        height: "44px",
                        borderRadius: "8px",
                        fontSize: "14px",
                        "& fieldset": { borderColor: BORDER },
                        "&:hover fieldset": { borderColor: BORDER },
                        "&.Mui-focused fieldset": { borderColor: BLUE },
                      },
                    },
                  },
                  // This modal is a plain fixed-position overlay (zIndex:
                  // 1400 below), not an MUI Dialog/Modal - so the
                  // DatePicker's popper, portaled to document.body with
                  // MUI's default Popper z-index (theme.zIndex.modal =
                  // 1300, no custom theme override found anywhere in the
                  // app), rendered BEHIND the overlay. Pinning the popper
                  // just above the overlay's own z-index (rather than
                  // guessing a large arbitrary number) is the actual fix.
                  popper: {
                    sx: { zIndex: 1401 },
                  },
                }}
              />
            </LocalizationProvider>
          </Field>

          <Field label="Paid Amount">
            <UnitInput
              prefix="AED"
              value={form.amount}
              onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
            />
          </Field>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "16px 24px",
            borderTop: `1px solid ${BORDER}`,
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <button
            onClick={handleSubmit}
            style={{
              height: 40,
              padding: "0 28px",
              background: BLUE,
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.88")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}