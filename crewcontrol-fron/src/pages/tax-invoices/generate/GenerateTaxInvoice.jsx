<<<<<<< HEAD
﻿import { useEffect, useState, useRef } from "react";
=======
import { useEffect, useState, useRef } from "react";
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
import { useNavigate, useSearchParams } from "react-router-dom";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import EditIcon from "@mui/icons-material/Edit";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import BusinessOutlinedIcon from "@mui/icons-material/BusinessOutlined";
import DomainVerificationOutlinedIcon from "@mui/icons-material/DomainVerificationOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import { companiesApi } from "../../../api/companies";
import { invoicesApi, aiJobsApi } from "../../../api/invoices";
import { ReusableStepper } from "../../../components/ReusableStepper";
import { Alert } from "@mui/material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import dayjs from "dayjs";

/* ═══════════════════════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════════════════════ */

const BLUE   = "var(--color-primary)";
const DARK   = "var(--text-primary)";
const GRAY   = "var(--text-secondary)";
const BORDER = "var(--border-card)";
const LIGHT  = "var(--bg-surface)";

const baseInput = {
  width: "100%",
  height: "44px",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: BORDER,
  borderRadius: "8px",
  padding: "0 12px",
  fontSize: "14px",
  color: "var(--text-primary)",
  background: "#fff",
  outline: "none",
  appearance: "none",
  WebkitAppearance: "none",
  fontFamily: "inherit",
  boxSizing: "border-box",
};

const dropArrow =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236B7280' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\")";

const backButtonStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "4px",
  fontSize: "14px",
  width: "75px",
  height: "32px",
  color: "#374151",
  background: "#fff",
  border: `1px solid ${BORDER}`,
  borderRadius: "8px",
  padding: "5px 12px",
  cursor: "pointer",
  marginBottom: "20px",
  fontFamily: "inherit",
};

const TAX_INVOICE_STEPS = [
  { id: 1, label: "Select Company", icon: BusinessOutlinedIcon },
  { id: 2, label: "Confirm Company Details", icon: DomainVerificationOutlinedIcon },
  { id: 3, label: "Invoice Details", icon: ReceiptLongOutlinedIcon },
];

/* ═══════════════════════════════════════════════════════════════
   PRIMITIVE COMPONENTS
═══════════════════════════════════════════════════════════════ */

function FInput({ style, ...p }) {
  const [f, setF] = useState(false);
  return (
    <input
      style={{
        ...baseInput,
        ...(f ? { borderColor: BLUE, boxShadow: `0 0 0 3px rgba(44,95,234,0.10)` } : {}),
        ...style,
      }}
      onFocus={() => setF(true)}
      onBlur={() => setF(false)}
      {...p}
    />
  );
}

function FSelect({ style, children, ...p }) {
  const [f, setF] = useState(false);
  return (
    <select
      style={{
        ...baseInput,
        backgroundImage: dropArrow,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 12px center",
        paddingRight: "32px",
        cursor: "pointer",
        ...(f ? { borderColor: BLUE, boxShadow: `0 0 0 3px rgba(44,95,234,0.10)` } : {}),
        ...style,
      }}
      onFocus={() => setF(true)}
      onBlur={() => setF(false)}
      {...p}
    >
      {children}
    </select>
  );
}

function CancelBtn({ onClick }) {
  const [h, setH] = useState(false);
  return (
    <button
      onClick={onClick}
      style={{
        height: "32px",
        padding: "0 20px",
        border: "none",
        borderRadius: "8px",
        background: h ? "#EFF4FF" : "#fff",
        color: "var(--color-primary)",
        fontSize: "12px",
        fontWeight: 500,
        lineHeight: "20px",
        cursor: "pointer",
        fontFamily: "inherit",
      }}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
    >
      Cancel
    </button>
  );
}

function PrimaryBtn({ onClick, children, disabled }) {
  const [h, setH] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        height: "32px",
        padding: "0 24px",
        border: "none",
        borderRadius: "8px",
        background: disabled ? "var(--border-input-hover)" : h ? "var(--color-primary)" : BLUE,
        color: "#fff",
        fontSize: "12px",
        fontWeight: 500,
        cursor: disabled ? "not-allowed" : "pointer",
        fontFamily: "inherit",
      }}
      onMouseEnter={() => !disabled && setH(true)}
      onMouseLeave={() => !disabled && setH(false)}
    >
      {children}
    </button>
  );
}

function Field({ label, required, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {label && (
        <label style={{ fontSize: "14px", color: DARK, display: "flex", gap: "2px", alignItems: "center" }}>
          {label}
          {required && <span style={{ color: "#F00" }}>*</span>}
        </label>
      )}
      {children}
    </div>
  );
}

function FormHeading({ title, subtitle }) {
  return (
    <div style={{ marginBottom: "32px" }}>
      <h2 style={{ fontSize: "18px", fontWeight: 600, color: DARK, lineHeight: "28px", letterSpacing: "0.72px", margin: "0 0 10px 0" }}>
        {title}
      </h2>
      <p style={{ fontSize: "14px", color: "var(--text-secondary)", lineHeight: "22px", letterSpacing: "0.42px", margin: 0 }}>
        {subtitle}
      </p>
    </div>
  );
}

const UploadCloudIconComponent = () => (
  <CloudUploadIcon sx={{ fontSize: 48, color: "var(--text-disabled)" }} />
);

/* ═══════════════════════════════════════════════════════════════
   STEP 1: SELECT COMPANY
═══════════════════════════════════════════════════════════════ */

function Step1({ data, onChange, companies }) {
  return (
    <div style={{ maxWidth: "560px" }}>
      <FormHeading
        title="Generate Tax Invoice"
        subtitle="Select the company for which you want to generate a tax invoice."
      />

      <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
        <Field label="Select a company" required>
          <FSelect value={data.companyId} onChange={(e) => onChange({ ...data, companyId: e.target.value })}>
            <option value="">Select</option>
            {companies.map((c) => (
              <option key={c._id || c.id} value={c._id || c.id}>
                {c.name}
              </option>
            ))}
          </FSelect>
        </Field>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   STEP 2: CONFIRM COMPANY DETAILS
═══════════════════════════════════════════════════════════════ */

function Step2({ data }) {
  return (
    <div style={{ maxWidth: "560px" }}>
      <FormHeading
        title="Generate Tax Invoices"
        subtitle="Review and verify the company information before proceeding."
      />

      <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
        <Field label="Company Name" required>
          <FInput type="text" value={data.name} readOnly style={{ background: "var(--bg-surface)", color: GRAY }} />
        </Field>

        <Field label="Telephone Number" required>
          <FInput type="text" value={data.phone} readOnly style={{ background: "var(--bg-surface)", color: GRAY }} />
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          <Field label="P.O. Box" required>
            <FInput type="text" value={data.poBox} readOnly style={{ background: "var(--bg-surface)", color: GRAY }} />
          </Field>
          <Field label="Fax Number" required>
            <FInput type="text" value={data.fax} readOnly style={{ background: "var(--bg-surface)", color: GRAY }} />
          </Field>
        </div>

        <Field label="Company Address" required>
          <textarea
            value={data.address}
            readOnly
            rows={3}
            style={{
              ...baseInput,
              height: "84px",
              padding: "10px 12px",
              resize: "none",
              background: "var(--bg-surface)",
              color: GRAY,
            }}
          />
        </Field>

        <Field label="Tax Registration Number (TRN)" required>
          <FInput type="text" value={data.trn} readOnly style={{ background: "var(--bg-surface)", color: GRAY }} />
        </Field>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   STEP 3: INVOICE DETAILS
═══════════════════════════════════════════════════════════════ */

function Step3({ data, onChange, companyName, invoiceNumber }) {
  const fileRef = useRef();
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState("");

  const handleFile = (file) => {
    if (file) {
      setFileName(file.name);
      onChange({ ...data, timesheetFile: file });
    }
  };

  const handleVATChange = (value) => {
    const numValue = Math.max(0, Math.min(100, parseInt(value) || 0));
    onChange({ ...data, vat: numValue });
  };

  const toggleField = (field) => {
    onChange({ ...data, [field]: !Boolean(data[field]) });
  };

  return (
    <div style={{ display: "flex", gap: "40px", width: "100%", maxWidth: "100%" }}>
      {/* LEFT COLUMN - FORM */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <FormHeading
          title="Generate Tax Invoices"
          subtitle="Enter invoice information and upload the timesheet."
        />

        <div style={{ display: "flex", flexDirection: "column", gap: "18px", maxWidth: "560px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
            <label style={{ fontSize: "14px", color: DARK, display: "flex", gap: "2px", alignItems: "center", whiteSpace: "nowrap" }}>
              Value Added Tax system ( VAT )
              <span style={{ color: "#F00" }}>*</span>
            </label>

            <div style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
              <button
                onClick={() => handleVATChange(data.vat - 1)}
                style={{
                  width: "32px",
                  height: "32px",
                  border: `1px solid ${BORDER}`,
                  background: "var(--bg-surface-secondary)",
                  borderRadius: "4px",
                  fontSize: "18px",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                −
              </button>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={data.vat}
                onChange={(e) => handleVATChange(e.target.value)}
                style={{
                  width: "40px",
                  height: "32px",
                  border: `1px solid transparent`,
                  borderRadius: "8px",
                  textAlign: "center",
                  fontSize: "14px",
                  color: "var(--text-primary)",
                  background: "transparent",
                  outline: "none",
                  appearance: "textfield",
                  WebkitAppearance: "none",
                  MozAppearance: "textfield",
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                  padding: 0,
                  lineHeight: "32px",
                  fontVariantNumeric: "tabular-nums",
                }}
              />
              <button
                onClick={() => handleVATChange(data.vat + 1)}
                style={{
                  width: "32px",
                  height: "32px",
                  border: `1px solid ${BORDER}`,
                  background: "var(--bg-surface-secondary)",
                  borderRadius: "4px",
                  fontSize: "18px",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                +
              </button>
            </div>
          </div>

          <Field label="Invoice Date" required>
            <LocalizationProvider dateAdapter={AdapterDayjs}>
              <DatePicker
                format="DD/MM/YYYY"
                sx={{ color: "var(--text-secondary)" }}
                value={data.invoiceDate ? dayjs(data.invoiceDate) : null}
                onChange={(newValue) => {
                  onChange({
                    ...data,
                    invoiceDate: newValue ? newValue.format("DD/MM/YYYY") : "",
                  });
                }}
                slotProps={{
                  textField: {
                    fullWidth: true,
                    placeholder: "DD/MM/YYYY",
                    sx: {
                      color: "var(--text-secondary)",
                      "& .MuiOutlinedInput-root": {
                      height: "44px",
                        borderRadius: "8px",
                        "& fieldset": {
                          borderColor: "var(--border-card)",
                        },
                        "&:hover fieldset": {
                          borderColor: "var(--border-card)",
                        },
                        "&.Mui-focused fieldset": {
                          borderColor: "var(--border-card)",
                        },
                      },
                    },
                  },
                }}
              />
            </LocalizationProvider>
          </Field>

          <Field label="Upload Timesheet" required>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
              style={{
                border: `1.5px dashed ${dragging ? BLUE : "var(--border-input-hover)"}`,
                borderRadius: "10px",
                padding: "40px 24px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "8px",
                background: dragging ? "#EFF4FF" : "var(--bg-surface)",
                cursor: "pointer",
              }}
              onClick={() => fileRef.current.click()}
            >
              <UploadCloudIconComponent />
              <p style={{ fontSize: "14px", color: DARK, margin: 0 }}>
                {fileName || "Drag & drop the timesheet here"}
              </p>
              <p style={{ fontSize: "12px", color: GRAY, margin: 0, fontStyle: "italic" }}>
                Accepted formats: PDF (Max 5MB)
              </p>
              <p style={{ fontSize: "13px", color: GRAY, margin: "4px 0" }}>- OR -</p>
              <button
                onClick={(e) => { e.stopPropagation(); fileRef.current.click(); }}
                style={{
                  height: "34px",
                  padding: "0 24px",
                  background: BLUE,
                  color: "#fff",
                  border: "none",
                  borderRadius: "6px",
                  fontSize: "14px",
                  fontWeight: 500,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Browse
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf"
              style={{ display: "none" }}
              onChange={(e) => handleFile(e.target.files[0])}
            />
          </Field>
        </div>
      </div>

      {/* RIGHT COLUMN - TWO SEPARATE CARDS (STICKY) */}
      <div
        style={{
          width: "240px",
          flexShrink: 0,
          position: "sticky",
          top: "28px",
          height: "fit-content",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        {/* Company Name Card */}
        <div
          style={{
            width: "240px",
            minHeight: "110px",
<<<<<<< HEAD
            background: "var(--bg-surface-secondary)",
=======
            background: "#F6F6F6",
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
            border: `1px solid ${BORDER}`,
            borderRadius: "8px",
            padding: "24px 20px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <p style={{ fontSize: "16px", color: "var(--text-secondary)", margin: 0, marginBottom: "18px", lineHeight: "26px", fontWeight: 400 }}>
            Company Name
          </p>
          <p style={{ fontSize: "32px", fontWeight: 500, color: "var(--text-primary)", margin: 0, lineHeight: "26px" }}>
            {companyName}
          </p>
        </div>

        {/* Invoice No Card */}
        <div
          style={{
            width: "240px",
            minHeight: "110px",
<<<<<<< HEAD
            background: "var(--bg-surface-secondary)",
=======
            background: "#F6F6F6",
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
            border: `1px solid ${BORDER}`,
            borderRadius: "8px",
            padding: "24px 20px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <p style={{ fontSize: "16px", color: "var(--text-secondary)", margin: 0, marginBottom: "18px", lineHeight: "26px", fontWeight: 400 }}>
            Invoice No.
          </p>
          <p style={{ fontSize: "32px", fontWeight: 500, color: "var(--text-primary)", margin: 0, lineHeight: "26px" }}>
            {invoiceNumber}
          </p>
        </div>

        <div
          style={{
            width: "240px",
            minHeight: "140px",
<<<<<<< HEAD
            background: "var(--bg-surface-secondary)",
=======
            background: "#F6F6F6",
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
            border: `1px solid ${BORDER}`,
            borderRadius: "8px",
            padding: "16px 16px 14px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-start",
            gap: "12px",
          }}
        >
<<<<<<< HEAD
          <p style={{ fontSize: "16px", fontWeight: 400, color: "var(--text-secondary)", margin: 0, lineHeight: "26px" }}>
=======
          <p style={{ fontSize: "16px", fontWeight: 400, color: "#808080", margin: 0, lineHeight: "26px" }}>
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
            Add
          </p>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
<<<<<<< HEAD
            <span style={{ fontSize: "14px", fontWeight: 400, color: "var(--text-primary)", lineHeight: "26px" }}>Signature</span>
=======
            <span style={{ fontSize: "14px", fontWeight: 400, color: "#141414", lineHeight: "26px" }}>Signature</span>
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
            <button
              type="button"
              onClick={() => toggleField("includeSignature")}
              style={{
                width: "38px",
                height: "18px",
                borderRadius: "999px",
                border: "none",
<<<<<<< HEAD
                background: data.includeSignature ? "var(--text-primary)" : "var(--text-disabled)",
=======
                background: data.includeSignature ? "#111827" : "#9CA3AF",
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
                position: "relative",
                cursor: "pointer",
                padding: 0,
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: "2px",
                  left: data.includeSignature ? "20px" : "2px",
                  width: "14px",
                  height: "14px",
                  borderRadius: "999px",
                  background: "#fff",
                  transition: "left 0.15s ease",
                }}
              />
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
<<<<<<< HEAD
            <span style={{ fontSize: "14px", fontWeight: 400, color: "var(--text-primary)", lineHeight: "26px" }}>Stamp</span>
=======
            <span style={{ fontSize: "14px", fontWeight: 400, color: "#141414", lineHeight: "26px" }}>Stamp</span>
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
            <button
              type="button"
              onClick={() => toggleField("includeStamp")}
              style={{
                width: "38px",
                height: "18px",
                borderRadius: "999px",
                border: "none",
<<<<<<< HEAD
                background: data.includeStamp ? "var(--text-primary)" : "var(--text-disabled)",
=======
                background: data.includeStamp ? "#111827" : "#9CA3AF",
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
                position: "relative",
                cursor: "pointer",
                padding: 0,
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: "2px",
                  left: data.includeStamp ? "20px" : "2px",
                  width: "14px",
                  height: "14px",
                  borderRadius: "999px",
                  background: "#fff",
                  transition: "left 0.15s ease",
                }}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   LAYOUT SHELL
═══════════════════════════════════════════════════════════════ */

function Shell({ currentStep, children, footerContent, onBack, isSuccess, onEdit }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
<<<<<<< HEAD
        background: "var(--bg-surface-secondary)",
=======
        background: "#F3F4F6",
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
        fontFamily: "sans-serif",
        overflow: "hidden",
      }}
    >
      {/* BODY */}
      <div style={{ flex: 1, padding: "24px", minHeight: 0 }}>
        <div
          style={{
            display: "flex",
            height: "100%",
            minHeight: 0,
            background: "#fff",
            border: `1px solid ${BORDER}`,
            borderRadius: "12px",
            overflow: "hidden",
          }}
        >
          {/* SIDEBAR */}
          <div
            style={{
              width: "282px",
              flexShrink: 0,
              height: "100%",
<<<<<<< HEAD
              background: "var(--bg-surface)",
=======
              background: "#F9FAFB",
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
              borderRight: `1px solid ${BORDER}`,
              padding: "28px 20px",
              overflow: "hidden",
            }}
          >
            <ReusableStepper currentStep={currentStep} steps={TAX_INVOICE_STEPS} />
          </div>

          {/* MAIN */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, height: "100%" }}>
            {/* Content area with independent scrolling */}
            <div className="thin-overlay-scroll" style={{ display: "flex", flexDirection: "column", padding: "32px 24px", position: "relative", flex: 1, minHeight: 0 }}>
              {isSuccess ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
                  <button
                    onClick={onBack}
                    style={backButtonStyle}
                    onMouseEnter={(e) => (e.currentTarget.style.background = LIGHT)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
                  >
                    <ChevronLeftIcon sx={{ fontSize: 16 }} />
                    Back
                  </button>
                  <button
                    onClick={onEdit}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "8px",
                      fontSize: "14px",
                      fontWeight: 500,
                      color: "var(--text-secondary)",
                      background: "#fff",
                      border: `1px solid ${BORDER}`,
                      borderRadius: "24px",
                      padding: "8px 18px",
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = LIGHT)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
                  >
                    <EditIcon sx={{ fontSize: 16 }} />
                    Edit
                  </button>
                </div>
              ) : (
                <button
                  onClick={onBack}
                  style={backButtonStyle}
                  onMouseEnter={(e) => (e.currentTarget.style.background = LIGHT)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
                >
                  <ChevronLeftIcon sx={{ fontSize: 16 }} />
                  Back
                </button>
              )}

              {children}
            </div>

            {/* FOOTER */}
            <div
              style={{
                background: "#fff",
                padding: "14px 40px",
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: "12px",
                flexShrink: 0,
              }}
            >
              {footerContent}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SUCCESS SCREEN
═══════════════════════════════════════════════════════════════ */

function SuccessScreen({ onPreview, onDownload }) {
  const SuccessCheckIcon = () => (
    <CheckCircleIcon sx={{ fontSize: 80, color: "var(--color-primary)" }} />
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "16px", minHeight: "100%" }}>
      <SuccessCheckIcon />
      <h2 style={{ fontSize: "24px", fontWeight: 600, color: DARK, margin: 0 }}>
        Tax Invoice Generated Successfully!
      </h2>
      <p style={{ fontSize: "14px", color: GRAY, margin: 0 }}>
        Your tax invoice has been created and is ready to view or download.
      </p>
      <div style={{ display: "flex", gap: "12px", marginTop: "16px" }}>
        <button
          onClick={onPreview}
          style={{
            padding: "10px 24px",
            background: "#fff",
            color: BLUE,
            border: `1px solid ${BLUE}`,
            borderRadius: "8px",
            fontSize: "14px",
            fontWeight: 500,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#EFF4FF")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
        >
          Preview Invoice
        </button>
        <button
          onClick={onDownload}
          style={{
            padding: "10px 24px",
            background: BLUE,
            color: "#fff",
            border: "none",
            borderRadius: "8px",
            fontSize: "14px",
            fontWeight: 500,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-primary-hover)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = BLUE)}
        >
          Download PDF
        </button>
      </div>
    </div>
  );
}

function SuccessDialog({ onPreview, onDownload, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(17, 24, 39, 0.48)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        zIndex: 1400,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: "520px",
          background: "#fff",
          borderRadius: "20px",
          boxShadow: "0 24px 80px var(--shadow-popover)",
          padding: "32px",
          textAlign: "center",
        }}
      >
        <SuccessScreen onPreview={onPreview} onDownload={onDownload} />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN GENERATE TAX INVOICE COMPONENT
═══════════════════════════════════════════════════════════════ */

export default function GenerateTaxInvoice() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [currentStep, setCurrentStep] = useState(1);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generatedInvoice, setGeneratedInvoice] = useState(null);
  const [invoiceNumberPreview, setInvoiceNumberPreview] = useState("--");
  const [companies, setCompanies] = useState([]);
  const [generateError, setGenerateError] = useState("");

  const [formData, setFormData] = useState({
    companyId: "",
    companyDetails: {
      name: "",
      phone: "",
      poBox: "",
      fax: "",
      address: "",
      trn: "",
    },
    invoiceDetails: {
      vat: 5,
      invoiceDate: "",
      timesheetFile: null,
      includeSignature: true,
      includeStamp: true,
    },
  });

  const preselectedCompanyId = searchParams.get("companyId") || "";

  useEffect(() => {
    let active = true;

    const loadCompanies = async () => {
      try {
        const response = await companiesApi.getClientCompanies();
        const nextCompanies = Array.isArray(response?.data?.data) ? response.data.data : [];

        if (active) {
          setCompanies(nextCompanies);

          if (preselectedCompanyId) {
            const preselectedCompany = nextCompanies.find(
              (company) => String(company?._id || company?.id) === String(preselectedCompanyId)
            );

            if (preselectedCompany) {
              setFormData((prev) => ({
                ...prev,
                companyId: String(preselectedCompany._id || preselectedCompany.id),
                companyDetails: {
                  name: preselectedCompany.name || preselectedCompany.companyLegalName || "",
                  phone: preselectedCompany.telephoneNumber || preselectedCompany.phone || "",
                  poBox: preselectedCompany.poBox || "",
                  fax: preselectedCompany.faxNumber || preselectedCompany.fax || "",
                  address: preselectedCompany.address || preselectedCompany.companyAddress || "",
                  trn: preselectedCompany.trn || "",
                },
              }));
              setCurrentStep(2);
            }
          }
        }
      } catch (error) {
        if (active) {
          setCompanies([]);
        }
      }
    };

    loadCompanies();

    return () => {
      active = false;
    };
  }, [preselectedCompanyId]);

  const getSelectedCompany = () => {
    return companies.find((c) => String(c._id || c.id) === String(formData.companyId));
  };

  useEffect(() => {
    let active = true;

    const loadNextInvoiceNumber = async () => {
      if (currentStep !== 3) {
        return;
      }

      try {
        const response = await invoicesApi.getNextInvoiceNumber();
        const nextNumber = response?.data?.data?.invoiceNumber || "--";
        if (active) {
          setInvoiceNumberPreview(nextNumber);
        }
      } catch (_error) {
        if (active) {
          setInvoiceNumberPreview("--");
        }
      }
    };

    loadNextInvoiceNumber();

    return () => {
      active = false;
    };
  }, [currentStep]);

  const isStep1Valid = () => formData.companyId !== "";

  const isStep3Valid = () => {
    return (
      formData.invoiceDetails.invoiceDate !== "" &&
      formData.invoiceDetails.timesheetFile !== null
    );
  };

  const handleNext = () => {
    if (currentStep === 1) {
      const company = getSelectedCompany();
      if (company) {
        setFormData((prev) => ({
          ...prev,
          companyDetails: {
            name: company.name || company.companyLegalName || "",
            phone: company.telephoneNumber || company.phone || "",
            poBox: company.poBox || "",
            fax: company.faxNumber || company.fax || "",
            address: company.address || company.companyAddress || "",
            trn: company.trn || "",
          },
        }));
      }
      setCurrentStep(2);
    } else if (currentStep === 2) {
      setCurrentStep(3);
    } else if (currentStep === 3) {
      handleGenerate();
    }
  };

  const handleGenerate = async () => {
    try {
      setIsSubmitting(true);
      setGenerateError("");

      const timesheetFile = formData.invoiceDetails.timesheetFile;
      if (!timesheetFile) {
        setGenerateError("Please upload a PDF timesheet before generating the invoice.");
        return;
      }

      const uploadResponse = await invoicesApi.uploadTimesheet(timesheetFile);
      const timesheetPath = uploadResponse.data?.path || uploadResponse.data?.filePath;

      if (!timesheetPath) {
        throw new Error("Timesheet upload failed");
      }

      const parsedInvoiceDate = dayjs(formData.invoiceDetails.invoiceDate, "DD/MM/YYYY", true);

      const enableAsync = String(import.meta.env.VITE_ENABLE_ASYNC_AI || '') === 'true';

      if (enableAsync) {
        // Queue a background job to generate the invoice
        const payload = {
          jobType: 'generate-invoice',
          pdfPath: timesheetPath,
          owner_company_id: undefined,
          owner_template_id: undefined,
          template_override: undefined,
          signature_override: undefined,
          stamp_override: undefined,
          include_signature: Boolean(formData.invoiceDetails.includeSignature),
          include_stamp: Boolean(formData.invoiceDetails.includeStamp),
          company_data: {
            companyId: formData.companyId,
            userId: undefined,
          },
        };

        const resp = await aiJobsApi.createJob(payload);
        const jobId = resp.data?.data?.jobId || resp.data?.jobId || resp.data?.data?.jobId;

        if (!jobId) throw new Error('Failed to queue async invoice job');

        // persist job info to localStorage so refresh recovery works
        const stored = { jobId, timesheetPath, createdAt: Date.now() };
        try { localStorage.setItem('asyncInvoiceJob', JSON.stringify(stored)); } catch (e) {}

        // open a modal/overlay to show progress and poll
        openJobProgress(jobId, timesheetPath);
        return;
      }

      // synchronous fallback
      const generatedResponse = await invoicesApi.generateInvoiceRecord({
        clientCompanyId: formData.companyId,
        invoiceNumber: invoiceNumberPreview !== "--" ? invoiceNumberPreview : undefined,
        timesheetPath,
        vatRate: Number(formData.invoiceDetails.vat || 0) / 100,
        includeSignature: Boolean(formData.invoiceDetails.includeSignature),
        includeStamp: Boolean(formData.invoiceDetails.includeStamp),
        invoiceDate: parsedInvoiceDate.isValid() ? parsedInvoiceDate.toDate() : new Date(),
      });

      const createdInvoice = generatedResponse.data?.invoice || generatedResponse.data;

      setGeneratedInvoice(createdInvoice);
      setIsSuccess(true);
    } catch (error) {
      console.error("Invoice generation failed:", error);
      const backendMessage = error?.response?.data?.message || error?.message || "Invoice generation failed";
      setGenerateError(backendMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ----------------- Async job UI + polling -----------------
  const [activeJob, setActiveJob] = useState(null);
  const pollRef = useRef(null);
  const jobStartTsRef = useRef(null);

  const clearPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    jobStartTsRef.current = null;
  };

  const openJobProgress = (jobId, timesheetPath) => {
    setActiveJob({ jobId, status: 'queued', timesheetPath, elapsedMs: 0 });
    jobStartTsRef.current = Date.now();
    // start polling every 2 seconds
    if (pollRef.current) clearPolling();
    pollRef.current = setInterval(() => pollJob(jobId), 2000);
    // immediate poll
    pollJob(jobId);
  };

  const pollJob = async (jobId) => {
    try {
      const resp = await aiJobsApi.getJobStatus(jobId);
      const job = resp.data?.data || resp.data;
      const now = Date.now();
      const elapsed = jobStartTsRef.current ? now - jobStartTs.current : now - (job.startedAt ? Date.parse(job.startedAt) : now);
      const next = {
        jobId,
        status: job.status,
        progress: job.progress,
        attemptsMade: job.attemptsMade,
        error: job.error,
        decisionTrace: job.decisionTrace || {},
        elapsedMs: elapsed,
      };
      setActiveJob(next);

      if (['completed', 'failed'].includes((job.status || '').toLowerCase())) {
        // done — fetch result and stop polling
        clearPolling();
        try { localStorage.removeItem('asyncInvoiceJob'); } catch (e) {}
        if (job.status === 'completed') {
          // fetch job result
          const res = await aiJobsApi.getJobResult(jobId);
          const result = res.data?.data || res.data;
          // try to extract created invoice record from result
          const createdInvoice = result?.result?.invoice || result?.invoice || result?.result || result;
          if (createdInvoice) {
            setGeneratedInvoice(createdInvoice);
            setIsSuccess(true);
            setActiveJob(null);
          }
        }
      }
    } catch (error) {
      console.error('Job poll failed', error);
      // network errors: keep polling but surface message
      setActiveJob((prev) => ({ ...(prev || {}), error: error?.message || 'Network error' }));
    }
  };

  // Resume job after refresh
  useEffect(() => {
    try {
      const raw = localStorage.getItem('asyncInvoiceJob');
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed?.jobId) {
        openJobProgress(parsed.jobId, parsed.timesheetPath);
      }
    } catch (e) {}
    return () => clearPolling();
  }, []);


  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
      return;
    }

    navigate("/tax-invoices");
  };

  const handleCancel = () => {
    navigate("/tax-invoices");
  };

  const handleEdit = () => {
    setIsSuccess(false);
    setGeneratedInvoice(null);
    setCurrentStep(1);
    setGenerateError("");
  };

  const handleSuccessClose = () => {
    setIsSuccess(false);
    navigate("/tax-invoices");
  };

  const handlePreview = async () => {
    const invoiceId = generatedInvoice?._id;
    if (!invoiceId) return;

    const previewWindow = window.open("", "_blank");
    if (!previewWindow) {
      setGenerateError("Popup blocked. Please allow popups and try again.");
      return;
    }

    try {
      previewWindow.opener = null;
    } catch (error) {
      // Ignore if browser disallows setting opener.
    }

    previewWindow.document.title = "Loading invoice...";
    previewWindow.document.body.innerHTML = '<p style="font-family: Arial, sans-serif; padding: 16px;">Loading invoice preview...</p>';

    try {
      const response = await invoicesApi.downloadInvoice(invoiceId);
      const blob = new Blob([response.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);

      previewWindow.location.href = url;

      setTimeout(() => {
        window.URL.revokeObjectURL(url);
      }, 60000);

      setIsSuccess(false);
      navigate("/tax-invoices");
    } catch (error) {
      previewWindow.close();
      console.error("Invoice preview failed:", error);
      setGenerateError("Failed to open invoice preview. Please try again.");
    }
  };

  const handleDownload = async () => {
    const invoiceId = generatedInvoice?._id;
    if (!invoiceId) return;

    try {
      const response = await invoicesApi.downloadInvoice(invoiceId);
      const blob = new Blob([response.data], { type: "application/pdf" });
      const fileName = `${generatedInvoice?.invoiceNumber || "invoice"}.pdf`;

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Invoice download failed:", error);
    } finally {
      setIsSuccess(false);
      navigate("/tax-invoices");
    }
  };

  const getNextButtonDisabled = () => {
    if (currentStep === 1) return !isStep1Valid();
    if (currentStep === 3) return !isStep3Valid();
    return false;
  };

  return (
    <Shell
      currentStep={currentStep}
      onBack={isSuccess ? handleCancel : handlePrevious}
      isSuccess={isSuccess}
      onEdit={handleEdit}
      footerContent={
        isSuccess ? null : (
          <>
            <CancelBtn onClick={handleCancel} />
            <PrimaryBtn onClick={handleNext} disabled={getNextButtonDisabled() || isSubmitting}>
              {currentStep === 3 ? (isSubmitting ? "Generating..." : "Generate") : "Next"}
            </PrimaryBtn>
          </>
        )
      }
    >
      {generateError ? (
        <Alert severity="error" sx={{ mx: 3, mt: 3 }}>
          {generateError}
        </Alert>
      ) : null}

      {currentStep === 1 ? (
        <Step1 data={formData} onChange={setFormData} companies={companies} />
      ) : currentStep === 2 ? (
        <Step2 data={formData.companyDetails} />
      ) : (
        <Step3
          data={formData.invoiceDetails}
          onChange={(newData) =>
            setFormData((prev) => ({
              ...prev,
              invoiceDetails: newData,
            }))
          }
          companyName={formData.companyDetails.name.split(" ")[0]}
          invoiceNumber={invoiceNumberPreview}
        />
      )}

      {isSuccess ? (
        <SuccessDialog
          onPreview={handlePreview}
          onDownload={handleDownload}
          onClose={handleSuccessClose}
        />
      ) : null}
    </Shell>
  );
}

