// crewcontrol-fron\src\pages\tax-invoices\generate\GenerateTaxInvoice.jsx
import { useEffect, useState, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import EditIcon from "@mui/icons-material/Edit";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import BusinessOutlinedIcon from "@mui/icons-material/BusinessOutlined";
import DomainVerificationOutlinedIcon from "@mui/icons-material/DomainVerificationOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import RefreshIcon from "@mui/icons-material/Refresh";
import CloseIcon from "@mui/icons-material/Close";
import { companiesApi } from "../../../api/companies";
import { invoicesApi, aiJobsApi } from "../../../api/invoices";
import { ReusableStepper } from "../../../components/ReusableStepper";
import { Alert, CircularProgress, Switch } from "@mui/material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import dayjs from "dayjs";
import InvoicePreviewWindow from "../../InvoicePreviewWindow";
import SearchableCompanyDropdown from "../../../components/common/SearchableCompanyDropdown";


/* ═══════════════════════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════════════════════ */

const BLUE   = "var(--color-primary)";
const DARK   = "var(--text-primary)";
const GRAY   = "var(--text-secondary)";
const BORDER = "var(--border-card)";
const LIGHT  = "var(--bg-surface)";
const GREEN  = "#1DA97E";
const RED    = "#D92D20";

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

// Same MUI Switch component/size used for the Profile popup's Dark Mode
// toggle (components/profile/ProfileCard.jsx) - only the checked (ON) track
// color is pinned to the spec's #1D4ED8; the OFF state is left as the
// component's own default grey, same as Dark Mode.
const SIGNATURE_STAMP_TEMPLATE_SWITCH_SX = {
  // Only the track goes blue when ON - the thumb stays white (its default
  // color), not blue, per design feedback.
  "& .MuiSwitch-switchBase.Mui-checked": { color: "#fff" },
  "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": {
    backgroundColor: "#1D4ED8",
    opacity: 1,
  },
};

const TAX_INVOICE_STEPS = [
  { id: 1, label: "Select Company", icon: BusinessOutlinedIcon },
  { id: 2, label: "Confirm Company Details", icon: DomainVerificationOutlinedIcon },
  { id: 3, label: "Invoice Details", icon: ReceiptLongOutlinedIcon },
];

/* ═══════════════════════════════════════════════════════════════
   GENERATION PROGRESS — STAGE DEFINITIONS
   These describe the real backend pipeline. The async job flow
   drives stages 3-14 from job.progress / job.decisionTrace (whatever
   signal the backend already exposes). Nothing here invents backend
   behavior — it only labels the existing pipeline for the user.
═══════════════════════════════════════════════════════════════ */

const ASYNC_GENERATION_STAGES = [
  { key: "upload", title: "Uploading Timesheet", description: "Uploading selected PDF to the server." },
  { key: "prepare_job", title: "Preparing Generation Job", description: "Creating secure invoice generation request." },
  { key: "parse_pdf", title: "Parsing PDF", description: "Reading pages, orientation, metadata and document structure." },
  { key: "analyze_document", title: "Analyzing Document", description: "Identifying tables, summaries, headers and layouts." },
  { key: "extract_employee", title: "Extracting Employee Information", description: "Reading employee names, shifts, attendance and work records." },
  { key: "extract_company", title: "Extracting Company Information", description: "Reading company details and invoice metadata." },
  { key: "extract_hours", title: "Extracting Working Hours", description: "Calculating normal hours, overtime and totals." },
  { key: "ai_processing", title: "AI Processing", description: "Normalizing extracted data into a structured invoice format." },
  { key: "validate", title: "Validating Extracted Information", description: "Checking for missing values, incorrect totals and inconsistencies." },
  { key: "prepare_invoice_data", title: "Preparing Invoice Data", description: "Calculating VAT, totals and invoice values." },
  { key: "apply_template", title: "Applying Company Template", description: "Loading company-specific invoice template, branding, signature and stamp." },
  { key: "render_pdf", title: "Rendering Invoice PDF", description: "Generating the final invoice using the rendering engine." },
  { key: "save_invoice", title: "Saving Invoice", description: "Saving generated invoice and metadata." },
  { key: "final_verification", title: "Final Verification", description: "Performing final validation before returning the invoice." },
  { key: "completed", title: "Completed", description: "Returning generated invoice to the frontend." },
];

// The synchronous fallback (VITE_ENABLE_ASYNC_AI !== 'true') only gives us
// two real signals: the upload request and the single blocking generate
// request. We show a smaller, honest timeline rather than inventing
// granular progress the backend never reports for this path.
const SYNC_GENERATION_STAGES = [
  { key: "upload", title: "Uploading Timesheet", description: "Uploading selected PDF to the server." },
  { key: "generate", title: "Generating Invoice", description: "Parsing the timesheet, extracting data and building your invoice." },
  { key: "completed", title: "Completed", description: "Returning generated invoice to the frontend." },
];

// Index range (inclusive) within ASYNC_GENERATION_STAGES that is driven by
// job.progress once the job has been created and is running server-side.
const ASYNC_PROGRESS_START_INDEX = 2; // "Parsing PDF"
const ASYNC_PROGRESS_END_INDEX = 13; // "Final Verification"
const ASYNC_PROGRESS_STAGE_COUNT = ASYNC_PROGRESS_END_INDEX - ASYNC_PROGRESS_START_INDEX + 1;
const ASYNC_COMPLETED_INDEX = ASYNC_GENERATION_STAGES.length - 1;


/**
 * Frontend-only mapping layer: existing job status/progress -> UI stage
 * index. Does not assume any backend change — falls back gracefully if
 * job.progress or job.decisionTrace are not present.
 */
function mapJobToStageIndex(job, previousIndex) {
  if (!job) return previousIndex;

  const status = String(job.status || "").toLowerCase();

  if (status === "completed") return ASYNC_COMPLETED_INDEX;

  // If the backend already reports a decisionTrace keyed by pipeline step,
  // prefer it — it's the most accurate signal available.
  if (job.decisionTrace && typeof job.decisionTrace === "object") {
    const doneKeys = ASYNC_GENERATION_STAGES
      .slice(ASYNC_PROGRESS_START_INDEX, ASYNC_PROGRESS_END_INDEX + 1)
      .filter((stage) => Boolean(job.decisionTrace[stage.key]));
    if (doneKeys.length > 0) {
      const lastDoneIndex = ASYNC_GENERATION_STAGES.findIndex(
        (s) => s.key === doneKeys[doneKeys.length - 1].key
      );
      return Math.max(previousIndex, lastDoneIndex);
    }
  }

  if (typeof job.progress === "number" && !Number.isNaN(job.progress)) {
    const clamped = Math.max(0, Math.min(100, job.progress));
    const offset = Math.min(
      ASYNC_PROGRESS_STAGE_COUNT - 1,
      Math.floor((clamped / 100) * ASYNC_PROGRESS_STAGE_COUNT)
    );
    return Math.max(previousIndex, ASYNC_PROGRESS_START_INDEX + offset);
  }

  if (status === "queued") return Math.max(previousIndex, 1);
  if (["processing", "running", "active", "in_progress", "started"].includes(status)) {
    return Math.max(previousIndex, ASYNC_PROGRESS_START_INDEX);
  }

  return previousIndex;
}

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

function CancelBtn({ onClick, disabled }) {
  const [h, setH] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        height: "32px",
        padding: "0 20px",
        border: "none",
        borderRadius: "8px",
        background: h && !disabled ? "#EFF4FF" : "#fff",
        color: "var(--color-primary)",
        fontSize: "12px",
        fontWeight: 500,
        lineHeight: "20px",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
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

function Step1({ data, onChange }) {
  return (
    <div style={{ maxWidth: "560px" }}>
      <FormHeading
        title="Generate Tax Invoice"
        subtitle="Select the company for which you want to generate a tax invoice."
      />

      <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
        <Field label="Select a company" required>
          <SearchableCompanyDropdown
            value={data.companyId}
            valueLabel={data.companyName}
            onChange={(companyId, option) => onChange({ ...data, companyId, companyName: option?.label || "" })}
          />
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
  const [timesheetPreviewUrl, setTimesheetPreviewUrl] = useState(null);

  const handleFile = (file) => {
    if (file) {
      setFileName(file.name);
      onChange({ ...data, timesheetFile: file });
    }
  };

  const handleRemoveTimesheet = () => {
    setFileName("");
    onChange({ ...data, timesheetFile: null });
    if (fileRef.current) fileRef.current.value = "";
  };

  // Blob URL for the "Preview" button - lets the user confirm they picked
  // the right file by opening it in a new tab, without needing it uploaded
  // to the server first. Revoked whenever the file changes or this step
  // unmounts, so we don't leak object URLs.
  useEffect(() => {
    if (!data.timesheetFile) {
      setTimesheetPreviewUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(data.timesheetFile);
    setTimesheetPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [data.timesheetFile]);

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
            {data.timesheetFile ? (
              <div
                style={{
                  border: `1.5px dashed var(--border-input-hover)`,
                  borderRadius: "10px",
                  padding: "32px 24px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "8px",
                  background: "var(--bg-surface)",
                }}
              >
                <InsertDriveFileOutlinedIcon sx={{ fontSize: 48, color: "#DC2626" }} />
                <p
                  style={{
                    fontSize: "14px",
                    color: DARK,
                    margin: "4px 0 0",
                    textAlign: "center",
                    wordBreak: "break-word",
                    maxWidth: "100%",
                  }}
                >
                  {fileName}
                </p>
                <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                  <button
                    type="button"
                    onClick={() => timesheetPreviewUrl && window.open(timesheetPreviewUrl, "_blank", "noopener")}
                    style={{
                      height: "34px",
                      padding: "0 20px",
                      background: "#fff",
                      color: BLUE,
                      border: `1px solid ${BLUE}`,
                      borderRadius: "6px",
                      fontSize: "14px",
                      fontWeight: 500,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    Preview
                  </button>
                  {/* <button
                    type="button"
                    onClick={() => fileRef.current.click()}
                    style={{
                      height: "34px",
                      padding: "0 20px",
                      background: "#fff",
                      color: BLUE,
                      border: `1px solid ${BLUE}`,
                      borderRadius: "6px",
                      fontSize: "14px",
                      fontWeight: 500,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    Browse
                  </button> */}
                  <button
                    type="button"
                    onClick={handleRemoveTimesheet}
                    style={{
                      height: "34px",
                      padding: "0 20px",
                      background: "#fff",
                      color: "#DC2626",
                      border: "1px solid #DC2626",
                      borderRadius: "6px",
                      fontSize: "14px",
                      fontWeight: 500,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : (
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
                  Drag & drop the timesheet here
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
            )}
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
            background: "var(--bg-surface-secondary)",
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
            background: "var(--bg-surface-secondary)",
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
            background: "var(--bg-surface-secondary)",
            border: `1px solid ${BORDER}`,
            borderRadius: "8px",
            padding: "16px 16px 14px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-start",
            gap: "12px",
          }}
        >
          <p style={{ fontSize: "16px", fontWeight: 400, color: "var(--text-secondary)", margin: 0, lineHeight: "26px" }}>
            Add
          </p>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "14px", fontWeight: 400, color: "var(--text-primary)", lineHeight: "26px" }}>Signature</span>
            <Switch
              size="small"
              checked={Boolean(data.includeSignature)}
              onChange={() => toggleField("includeSignature")}
              sx={SIGNATURE_STAMP_TEMPLATE_SWITCH_SX}
              inputProps={{ "aria-label": "toggle signature" }}
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "14px", fontWeight: 400, color: "var(--text-primary)", lineHeight: "26px" }}>Stamp</span>
            <Switch
              size="small"
              checked={Boolean(data.includeStamp)}
              onChange={() => toggleField("includeStamp")}
              sx={SIGNATURE_STAMP_TEMPLATE_SWITCH_SX}
              inputProps={{ "aria-label": "toggle stamp" }}
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "14px", fontWeight: 400, color: "var(--text-primary)", lineHeight: "26px" }}>Template</span>
            <Switch
              size="small"
              checked={Boolean(data.includeTemplate)}
              onChange={() => toggleField("includeTemplate")}
              sx={SIGNATURE_STAMP_TEMPLATE_SWITCH_SX}
              inputProps={{ "aria-label": "toggle template" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   GENERATION DIALOG — one continuous modal that morphs from
   "progress" -> "error" (retryable) -> "success"
═══════════════════════════════════════════════════════════════ */

// Injected once; keyframes for the header icon pulse, the spinner ring and
// the checkmark pop used across the generation dialog.
function GenerationDialogStyles() {
  return (
    <style>{`
      @keyframes ftiPulse {
        0%, 100% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.12); opacity: 0.75; }
      }
      @keyframes ftiSpin {
        to { transform: rotate(360deg); }
      }
      @keyframes ftiPop {
        0% { transform: scale(0.4); opacity: 0; }
        60% { transform: scale(1.15); opacity: 1; }
        100% { transform: scale(1); opacity: 1; }
      }
      @keyframes ftiFadeIn {
        from { opacity: 0; transform: translateY(4px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes ftiDialogIn {
        from { opacity: 0; transform: scale(0.96); }
        to { opacity: 1; transform: scale(1); }
      }
      .fti-dialog-in { animation: ftiDialogIn 0.22s ease-out; }
      .fti-fade-row { animation: ftiFadeIn 0.28s ease-out; }
      .fti-pulse-icon { animation: ftiPulse 1.6s ease-in-out infinite; }
      .fti-spin { animation: ftiSpin 0.85s linear infinite; }
      .fti-pop { animation: ftiPop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1); }
      @media (prefers-reduced-motion: reduce) {
        .fti-dialog-in, .fti-fade-row, .fti-pulse-icon, .fti-spin, .fti-pop { animation: none !important; }
      }
    `}</style>
  );
}

// Shared outer chrome, identical to the original success popup: same
// overlay, width, radius, spacing and shadow. Only inner content changes.
function DialogShell({ children, onClose, locked }) {
  return (
    <div
      onClick={locked ? undefined : onClose}
      role="dialog"
      aria-modal="true"
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
      <GenerationDialogStyles />
      <div
        className="fti-dialog-in"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: "520px",
          maxHeight: "min(680px, 88vh)",
          background: "#fff",
          borderRadius: "20px",
          boxShadow: "0 24px 80px var(--shadow-popover)",
          padding: "32px",
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function GenerationElapsedTimer({ startedAt, running }) {
  const [nowTs, setNowTs] = useState(() => Date.now());

  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  const elapsedSeconds = startedAt ? Math.max(0, Math.floor((nowTs - startedAt) / 1000)) : 0;
  const mm = String(Math.floor(elapsedSeconds / 60)).padStart(2, "0");
  const ss = String(elapsedSeconds % 60).padStart(2, "0");

  return (
    <div
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "2px",
        padding: "8px 18px",
        background: "var(--bg-surface-secondary)",
        border: `1px solid ${BORDER}`,
        borderRadius: "10px",
      }}
    >
      <span style={{ fontSize: "11px", color: GRAY, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        Elapsed Time
      </span>
      <span style={{ fontSize: "18px", fontWeight: 600, color: DARK, fontVariantNumeric: "tabular-nums" }}>
        {mm}:{ss}
      </span>
    </div>
  );
}

function GenerationHeader() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
      <div
        className="fti-pulse-icon"
        style={{
          width: "56px",
          height: "56px",
          borderRadius: "50%",
          background: "#EFF4FF",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <AutoAwesomeIcon sx={{ fontSize: 28, color: "var(--color-primary)" }} />
      </div>
      <h2 style={{ fontSize: "20px", fontWeight: 600, color: DARK, margin: 0 }}>
        Generating Tax Invoice...
      </h2>
      <p style={{ fontSize: "13px", color: GRAY, margin: 0, maxWidth: "380px", lineHeight: "20px" }}>
        Please wait while we analyze your timesheet, extract information, validate the data and generate your invoice.
      </p>
    </div>
  );
}

function GenerationStatusIcon({ status }) {
  const size = 22;
  if (status === "completed") {
    return (
      <div className="fti-pop" style={{ display: "flex" }}>
        <CheckCircleIcon sx={{ fontSize: size, color: GREEN }} />
      </div>
    );
  }
  if (status === "failed") {
    return <ErrorOutlineIcon sx={{ fontSize: size, color: RED }} />;
  }
  if (status === "running") {
    return (
      <div
        className="fti-spin"
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          border: `2px solid rgba(44,95,234,0.18)`,
          borderTopColor: "var(--color-primary)",
          boxSizing: "border-box",
        }}
      />
    );
  }
  return <RadioButtonUncheckedIcon sx={{ fontSize: size, color: "var(--border-input-hover)" }} />;
}

function GenerationTimelineItem({ stage, status, isLast }) {
  const titleColor = status === "waiting" ? GRAY : DARK;
  const opacity = status === "waiting" ? 0.6 : 1;

  return (
    <div className="fti-fade-row" style={{ display: "flex", gap: "12px", opacity, textAlign: "left" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "22px", flexShrink: 0 }}>
        <GenerationStatusIcon status={status} />
        {!isLast && (
          <div
            style={{
              width: "2px",
              flex: 1,
              minHeight: "16px",
              margin: "4px 0",
              background: status === "completed" ? GREEN : BORDER,
              borderRadius: "1px",
            }}
          />
        )}
      </div>
      <div style={{ paddingBottom: isLast ? 0 : "16px" }}>
        <p style={{ margin: 0, fontSize: "13.5px", fontWeight: status === "running" ? 600 : 500, color: titleColor, lineHeight: "18px" }}>
          {stage.title}
        </p>
        {status === "running" && (
          <p style={{ margin: "3px 0 0 0", fontSize: "12px", color: GRAY, lineHeight: "16px" }}>
            {stage.description}
          </p>
        )}
      </div>
    </div>
  );
}

function GenerationTimeline({ stages, currentIndex }) {
  return (
    <div
      className="thin-overlay-scroll"
      style={{
        textAlign: "left",
        overflowY: "auto",
        padding: "4px 4px 4px 0",
        flex: 1,
        minHeight: 0,
      }}
    >
      {stages.map((stage, idx) => {
        let status = "waiting";
        if (idx < currentIndex) status = "completed";
        else if (idx === currentIndex) status = "completed" === stage.forcedStatus ? "completed" : "running";
        return (
          <GenerationTimelineItem
            key={stage.key}
            stage={stage}
            status={status}
            isLast={idx === stages.length - 1}
          />
        );
      })}
    </div>
  );
}

function GenerationProgressDialog({ stages, currentIndex, startedAt }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
      <GenerationHeader />
      <GenerationTimeline stages={stages} currentIndex={currentIndex} />
      <div style={{ paddingTop: "16px", display: "flex", justifyContent: "center" }}>
        <GenerationElapsedTimer startedAt={startedAt} running />
      </div>
    </div>
  );
}

function GenerationErrorView({ message, onRetry, onClose }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "14px", flex: 1 }}>
      <div
        style={{
          width: "56px",
          height: "56px",
          borderRadius: "50%",
          background: "#FEF3F2",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ErrorOutlineIcon sx={{ fontSize: 30, color: RED }} />
      </div>
      <h2 style={{ fontSize: "20px", fontWeight: 600, color: DARK, margin: 0 }}>
        Generation Failed
      </h2>
      <p style={{ fontSize: "14px", color: GRAY, margin: 0, maxWidth: "380px", lineHeight: "20px" }}>
        {message || "Something went wrong while generating your invoice. Your form details have been kept."}
      </p>
      <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
        <button
          onClick={onClose}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: "10px 22px",
            background: "#fff",
            color: DARK,
            border: `1px solid ${BORDER}`,
            borderRadius: "8px",
            fontSize: "14px",
            fontWeight: 500,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          <CloseIcon sx={{ fontSize: 16 }} />
          Close
        </button>
        <button
          onClick={onRetry}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: "10px 22px",
            background: BLUE,
            color: "#fff",
            border: "none",
            borderRadius: "8px",
            fontSize: "14px",
            fontWeight: 500,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          <RefreshIcon sx={{ fontSize: 16 }} />
          Retry
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SUCCESS SCREEN (unchanged design, reused inside the same shell)
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

/* ═══════════════════════════════════════════════════════════════
   LAYOUT SHELL
═══════════════════════════════════════════════════════════════ */

function Shell({ currentStep, children, footerContent, onBack, isSuccess, onEdit, locked }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
        background: "var(--bg-surface-secondary)",
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
              background: "var(--bg-surface)",
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
                    disabled={locked}
                    style={{ ...backButtonStyle, opacity: locked ? 0.5 : 1, cursor: locked ? "not-allowed" : "pointer" }}
                    onMouseEnter={(e) => !locked && (e.currentTarget.style.background = LIGHT)}
                    onMouseLeave={(e) => !locked && (e.currentTarget.style.background = "#fff")}
                  >
                    <ChevronLeftIcon sx={{ fontSize: 16 }} />
                    Back
                  </button>
                  <button
                    onClick={onEdit}
                    disabled={locked}
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
                      cursor: locked ? "not-allowed" : "pointer",
                      opacity: locked ? 0.5 : 1,
                      fontFamily: "inherit",
                    }}
                    onMouseEnter={(e) => !locked && (e.currentTarget.style.background = LIGHT)}
                    onMouseLeave={(e) => !locked && (e.currentTarget.style.background = "#fff")}
                  >
                    <EditIcon sx={{ fontSize: 16 }} />
                    Edit
                  </button>
                </div>
              ) : (
                <button
                  onClick={onBack}
                  disabled={locked}
                  style={{ ...backButtonStyle, opacity: locked ? 0.5 : 1, cursor: locked ? "not-allowed" : "pointer" }}
                  onMouseEnter={(e) => !locked && (e.currentTarget.style.background = LIGHT)}
                  onMouseLeave={(e) => !locked && (e.currentTarget.style.background = "#fff")}
                >
                  <ChevronLeftIcon sx={{ fontSize: 16 }} />
                  Back
                </button>
              )}

              {children}
            </div>

            {/* FOOTER */}
            {footerContent ? (
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
            ) : null}
          </div>
        </div>
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
  // Synchronous guard against a rapid double-click producing two invoices -
  // see useSubmitGuard.js for why a ref beats a plain state flag here.
  const generateGuardRef = useRef(false);
  const [generatedInvoice, setGeneratedInvoice] = useState(null);
  // Id of the draft currently open in the inline review stage (genPhase ===
  // "review"). Null when the review stage isn't showing.
  const [reviewDraftId, setReviewDraftId] = useState(null);
  const [invoiceNumberPreview, setInvoiceNumberPreview] = useState("--");
  const [generateError, setGenerateError] = useState("");

  // ----------------- Generation dialog presentation state -----------------
  // genPhase: null (closed) | 'progress' | 'error' | 'success'
  // This is purely presentational — it does not alter any business logic,
  // API calls, polling architecture, or the sync/async decision below.
  const [genPhase, setGenPhase] = useState(null);
  const [genStages, setGenStages] = useState(ASYNC_GENERATION_STAGES);
  const [genStageIndex, setGenStageIndex] = useState(0);
  const [genError, setGenError] = useState("");
  const [genStartedAt, setGenStartedAt] = useState(null);

  const [formData, setFormData] = useState({
    companyId: "",
    companyName: "",
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
      includeTemplate: true,
    },
  });

  const preselectedCompanyId = searchParams.get("companyId") || "";

  // Deep-link case only (e.g. "Generate Invoice" from a company profile,
  // which already knows the company id up front) - fetches that ONE
  // company's full record directly rather than loading the tenant's whole
  // company list just to find it locally. Step 1's own dropdown never
  // needs this list either now - SearchableCompanyDropdown fetches its own
  // (small, server-searched) options on demand.
  useEffect(() => {
    let active = true;
    if (!preselectedCompanyId) return undefined;

    const loadPreselectedCompany = async () => {
      try {
        const response = await companiesApi.getCompany(preselectedCompanyId);
        const company = response?.data?.data || response?.data;
        if (active && company) {
          setFormData((prev) => ({
            ...prev,
            companyId: String(company._id || company.id),
            companyName: company.name || company.companyLegalName || "",
            companyDetails: {
              name: company.name || company.companyLegalName || "",
              phone: company.telephoneNumber || company.phone || "",
              poBox: company.poBox || "",
              fax: company.faxNumber || company.fax || "",
              address: company.address || company.companyAddress || "",
              trn: company.trn || "",
            },
          }));
          setCurrentStep(2);
        }
      } catch (error) {
        // Deep-link company id was invalid/inaccessible - leave the wizard
        // on Step 1 so the user can pick a company manually instead.
      }
    };

    loadPreselectedCompany();

    return () => {
      active = false;
    };
  }, [preselectedCompanyId]);

  // Fetches the selected company's full record on demand (Step 1 only ever
  // knows its id + display name from the search dropdown) instead of
  // requiring the whole list to already be loaded client-side.
  const getSelectedCompany = async () => {
    if (!formData.companyId) return null;
    try {
      const response = await companiesApi.getCompany(formData.companyId);
      return response?.data?.data || response?.data || null;
    } catch (error) {
      return null;
    }
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

  const handleNext = async () => {
    if (currentStep === 1) {
      const company = await getSelectedCompany();
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
      handleGenerateReview();
    }
  };

  // Uploads the timesheet, creates the draft, and shows the same
  // Uploading/Generating/Completed progress dialog + elapsed timer the old
  // synchronous flow used (SYNC_GENERATION_STAGES / GenerationProgressDialog)
  // while the AI service extracts in the background - only switching genPhase
  // to "review" once the draft is actually ready to edit. This is what keeps
  // the waiting experience identical to what was there before the popup
  // window existed, instead of a different-looking loading screen.
  const handleGenerateReview = async () => {
    const timesheetFile = formData.invoiceDetails.timesheetFile;
    if (!timesheetFile) {
      const msg = "Please upload a PDF timesheet before generating the invoice.";
      setGenerateError(msg);
      setGenError(msg);
      setGenPhase("error");
      return;
    }
    try {
      setIsSubmitting(true);
      setGenerateError("");
      setGenStages(SYNC_GENERATION_STAGES);
      setGenStageIndex(0); // "Uploading Timesheet"
      setGenStartedAt(Date.now());
      setGenPhase("progress");

      const upload = await invoicesApi.uploadTimesheet(timesheetFile);
      const pdfPath = upload.data?.path || upload.data?.filePath;
      if (!pdfPath) throw new Error("Timesheet upload failed");

      setGenStageIndex(1); // "Generating Invoice"

      const parsedInvoiceDate = dayjs(formData.invoiceDetails.invoiceDate, "DD/MM/YYYY", true);

      const { data } = await invoicesApi.generateDraft({
        pdfPath,
        companyId: formData.companyId,
        // The wizard's own VAT stepper (step 2) - without this the draft
        // fell back to whatever the extractor could infer from the
        // document itself (or a hardcoded 5% if it found nothing), which is
        // why the review screen's VAT% never matched what was set here.
        vatRate: Number(formData.invoiceDetails.vat || 0) / 100,
        // Same problem as VAT had: without this, approval left
        // Invoice.invoiceDate on its schema default (today), which is why
        // a 30/06/2026 selection was printing as today's date instead.
        //
        // A plain "YYYY-MM-DD" calendar string, not toDate().toISOString().
        // The invoice date is a calendar day, not a point in time - routing
        // it through a JS Date object and then toISOString() converts the
        // selected day's LOCAL midnight into a UTC instant, which lands on
        // the previous (or next) calendar day depending on the browser's
        // timezone offset. A bare date string has no time/timezone
        // component to shift, so the backend (which parses date-only
        // strings as UTC midnight, then formats back out using UTC fields)
        // prints exactly the day that was selected, regardless of where the
        // browser or server happen to be.
        invoiceDate: parsedInvoiceDate.isValid()
          ? parsedInvoiceDate.format("YYYY-MM-DD")
          : null,
        include_signature: Boolean(formData.invoiceDetails.includeSignature),
        include_stamp: Boolean(formData.invoiceDetails.includeStamp),
        include_template: Boolean(formData.invoiceDetails.includeTemplate),
      });
      const draftId = data.data.draftId;

      // The AI service extracts in the background (status starts as
      // "extracting"); poll it the same way this page already polls async
      // AI job status, reusing the same dialog while it waits.
      await pollDraftUntilReady(draftId);

      setGenStageIndex(SYNC_GENERATION_STAGES.length - 1); // "Completed"
      setReviewDraftId(draftId);
      // Brief pause so "Completed" is visible for a beat, same as the old
      // flow's setTimeout before flipping phases.
      setTimeout(() => setGenPhase("review"), 300);
    } catch (err) {
      const msg = err.message || "Failed to start invoice review.";
      setGenerateError(msg);
      setGenError(msg);
      setGenPhase("error");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Polls a draft until the AI service finishes extracting (or fails) -
  // the draft-flow equivalent of this page's existing AI-job-status polling.
  const pollDraftUntilReady = (draftId) =>
    new Promise((resolve, reject) => {
      const poll = async () => {
        try {
          const res = await invoicesApi.getDraft(draftId);
          const d = res.data?.data;
          if (!d) {
            reject(new Error("Unexpected response while checking extraction status."));
            return;
          }
          if (d.status === "failed") {
            reject(new Error(d.error || "Extraction did not complete."));
            return;
          }
          if (d.status === "extracting") {
            setTimeout(poll, 2000);
            return;
          }
          resolve(d);
        } catch (err) {
          reject(err);
        }
      };
      poll();
    });

  // The draft was approved and the PDF exists - hand off to the exact same
  // success screen (and its Preview/Download buttons) the old synchronous
  // generation path already used, by populating the same `generatedInvoice`
  // state those buttons read from.
  //
  // Deliberately does NOT clear reviewDraftId here. The review window and
  // the success dialog below are rendered from two separate conditions
  // (genPhase === "review" vs genPhase !== "review") that used to also
  // both require/exclude reviewDraftId - clearing it in the same call that
  // flips genPhase meant a render could briefly observe one state updated
  // but not the other (e.g. genPhase already "success" while reviewDraftId
  // hadn't cleared yet, or vice versa), flashing the full editable review
  // screen for a frame right before the success screen took over. genPhase
  // alone is now the single source of truth for which of the two mutually
  // exclusive screens is visible; reviewDraftId only needs to hold the
  // correct id whenever genPhase is actually "review" again, which
  // handleGenerateReview already guarantees by setting it fresh before
  // flipping genPhase back to "review".
  const handleReviewApproved = (data) => {
    setGeneratedInvoice({
      _id: data.invoiceId,
      invoiceNumber: data.invoiceNumber,
    });
    setIsSuccess(true);
    setGenPhase("success");
  };

  // User backed out of the review stage without approving - just close it,
  // no dialog, no lingering window.
  const handleReviewClose = () => {
    setReviewDraftId(null);
    setGenPhase(null);
  };

  const handleGenerate = async () => {
    if (generateGuardRef.current) return;
    generateGuardRef.current = true;

    // Reset + open the generation dialog immediately so the app never
    // appears frozen, regardless of sync vs async mode.
    const enableAsync = String(import.meta.env.VITE_ENABLE_ASYNC_AI || '') === 'true';
    setGenStages(enableAsync ? ASYNC_GENERATION_STAGES : SYNC_GENERATION_STAGES);
    setGenStageIndex(0);
    setGenError("");
    setGenStartedAt(Date.now());
    setGenPhase("progress");

    try {
      setIsSubmitting(true);
      setGenerateError("");

      const timesheetFile = formData.invoiceDetails.timesheetFile;
      if (!timesheetFile) {
        const msg = "Please upload a PDF timesheet before generating the invoice.";
        setGenerateError(msg);
        setGenError(msg);
        setGenPhase("error");
        return;
      }

      const uploadResponse = await invoicesApi.uploadTimesheet(timesheetFile);
      const timesheetPath = uploadResponse.data?.path || uploadResponse.data?.filePath;

      if (!timesheetPath) {
        throw new Error("Timesheet upload failed");
      }

      // "Uploading Timesheet" complete -> move into "Preparing Generation Job"
      setGenStageIndex((prev) => Math.max(prev, 1));

      const parsedInvoiceDate = dayjs(formData.invoiceDetails.invoiceDate, "DD/MM/YYYY", true);

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

        // Job accepted -> processing begins server-side
        setGenStageIndex((prev) => Math.max(prev, ASYNC_PROGRESS_START_INDEX));

        // persist job info to localStorage so refresh recovery works
        const stored = { jobId, timesheetPath, createdAt: Date.now() };
        try { localStorage.setItem('asyncInvoiceJob', JSON.stringify(stored)); } catch (e) {}

        // open a modal/overlay to show progress and poll
        openJobProgress(jobId, timesheetPath);
        return;
      }

      // synchronous fallback
      setGenStageIndex((prev) => Math.max(prev, 1));
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
      setGenStageIndex(SYNC_GENERATION_STAGES.length - 1);
      setIsSuccess(true);
      // Let the "Completed" checkmark render for a beat before morphing
      // into the success view, so it doesn't feel like an abrupt swap.
      setTimeout(() => setGenPhase("success"), 450);

      // The "Invoice No." card would otherwise keep showing the number that
      // was fetched when this page first loaded, since nothing else here
      // re-triggers that effect. Refresh it now so if the user generates
      // another invoice in the same session, the card already shows the
      // real next number instead of the one just used.
      try {
        const previewResponse = await invoicesApi.getNextInvoiceNumber();
        const nextNumber = previewResponse?.data?.data?.invoiceNumber;
        if (nextNumber) setInvoiceNumberPreview(nextNumber);
      } catch (_error) {
        // Non-critical - the backend always allocates the correct number
        // server-side regardless of what this preview shows.
      }
    } catch (error) {
      console.error("Invoice generation failed:", error);
      const requiresReview = error?.response?.data?.requiresManualApproval === true;
      const backendMessage = requiresReview
        ? "This extraction requires human review before the invoice can be generated. Please use the standard generation flow, which includes a review step, instead of retrying here."
        : error?.response?.data?.message || error?.message || "Invoice generation failed";
      setGenError(backendMessage);
      setGenPhase("error");
    } finally {
      setIsSubmitting(false);
      generateGuardRef.current = false;
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
      const elapsed = jobStartTsRef.current ? now - jobStartTsRef.current : now - (job.startedAt ? Date.parse(job.startedAt) : now);
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

      // Drive the generation dialog timeline from the same job payload the
      // app already polls — no new endpoints, no new fields required.
      setGenStageIndex((prev) => mapJobToStageIndex(job, prev));

      const statusLower = (job.status || '').toLowerCase();

      if (statusLower === 'failed') {
        clearPolling();
        try { localStorage.removeItem('asyncInvoiceJob'); } catch (e) {}
        setGenError(job.error || 'Invoice generation failed');
        setGenPhase('error');
        return;
      }

      if (statusLower === 'completed') {
        // done — fetch result and stop polling
        clearPolling();
        try { localStorage.removeItem('asyncInvoiceJob'); } catch (e) {}
        // fetch job result
        const res = await aiJobsApi.getJobResult(jobId);
        const result = res.data?.data || res.data;
        // try to extract created invoice record from result
        const createdInvoice = result?.result?.invoice || result?.invoice || result?.result || result;
        if (createdInvoice) {
          setGeneratedInvoice(createdInvoice);
          setIsSuccess(true);
          setActiveJob(null);
          setGenStageIndex(ASYNC_COMPLETED_INDEX);
          // Let the final checkmark land before morphing into success.
          setTimeout(() => setGenPhase('success'), 450);
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
        setGenStages(ASYNC_GENERATION_STAGES);
        setGenStageIndex(ASYNC_PROGRESS_START_INDEX);
        setGenStartedAt(parsed.createdAt || Date.now());
        setGenPhase('progress');
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
    setReviewDraftId(null);
    setCurrentStep(1);
    setGenerateError("");
  };

  const handleSuccessClose = () => {
    setIsSuccess(false);
    setGenPhase(null);
    setReviewDraftId(null);
    navigate("/tax-invoices");
  };

  // Closing out of an error state keeps all entered form data and simply
  // returns the user to the (untouched) Invoice Details step.
  const handleGenDialogErrorClose = () => {
    setGenPhase(null);
  };

  // Retry reuses the exact same entry point the Generate button itself now
  // calls - the old handleGenerate() (sync/async job flow) is no longer
  // reachable from this dialog since the review stage replaced it.
  const handleRetryGenerate = () => {
    handleGenerateReview();
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
      setGenPhase(null);
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
      setGenPhase(null);
      navigate("/tax-invoices");
    }
  };

  const getNextButtonDisabled = () => {
    if (currentStep === 1) return !isStep1Valid();
    if (currentStep === 3) return !isStep3Valid();
    return false;
  };

  // Lock all surrounding interaction (form, nav, footer) exactly while
  // generation is actively running — error/success states allow the user
  // to act (retry, close, preview, download) as required by the spec.
  const isGenerationRunning = genPhase === "progress";
  const isDialogOpen = Boolean(genPhase);

  // Block ESC while the dialog is locked, per "LOCK USER INTERACTION".
  useEffect(() => {
    if (!isGenerationRunning) return undefined;
    const handler = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [isGenerationRunning]);

  return (
    <Shell
      currentStep={currentStep}
      onBack={isSuccess ? handleCancel : handlePrevious}
      isSuccess={isSuccess}
      onEdit={handleEdit}
      locked={isGenerationRunning}
      footerContent={
        isDialogOpen ? null : (
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
        <Alert severity="error" sx={{       border: "1px solid #d32f2f31",
p:0 ,mb:2 ,      "& .MuiAlert-icon": {
        p: 1,
      }, }}>
          {generateError}
        </Alert>
      ) : null}

      {currentStep === 1 ? (
        <Step1 data={formData} onChange={setFormData} />
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

      {genPhase && genPhase !== "review" ? (
        <DialogShell locked={isGenerationRunning} onClose={genPhase === "success" ? handleSuccessClose : handleGenDialogErrorClose}>
          {genPhase === "progress" && (
            <GenerationProgressDialog stages={genStages} currentIndex={genStageIndex} startedAt={genStartedAt} />
          )}
          {genPhase === "error" && (
            <GenerationErrorView message={genError} onRetry={handleRetryGenerate} onClose={handleGenDialogErrorClose} />
          )}
          {genPhase === "success" && (
            <SuccessScreen onPreview={handlePreview} onDownload={handleDownload} />
          )}
        </DialogShell>
      ) : null}

      {genPhase === "review" ? (
        <InvoicePreviewWindow
          draftId={reviewDraftId}
          embedded
          onApproved={handleReviewApproved}
          onClose={handleReviewClose}
        />
      ) : null}
    </Shell>
  );
}