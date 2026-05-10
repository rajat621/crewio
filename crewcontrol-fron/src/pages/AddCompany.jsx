import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { companiesApi } from "../api/companies";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ArrowBackIosIcon from '@mui/icons-material/ArrowBackIos';
import EditIcon from "@mui/icons-material/Edit";
import { ReusableStepper } from "../components/ReusableStepper";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import dayjs from "dayjs";

/* ═══════════════════════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════════════════════ */

const BLUE   = "#2C5FEA";
const DARK   = "#111827";
const GRAY   = "#6B7280";
const BORDER = "#DEDEDE";
const LIGHT  = "#F9FAFB";

const baseInput = {
  width: "100%",
  height: "44px",
  border: `1px solid ${BORDER}`,
  borderRadius: "8px",
  padding: "0 12px",
  fontSize: "14px",
  color: "#141414",
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
  gap: "8px",
  fontSize: "14px",
  fontWeight: 500,
  color: "#6B7280",
  background: "#fff",
  border: `1px solid ${BORDER}`,
  borderRadius: "24px",
  padding: "8px 18px",
  cursor: "pointer",
  fontFamily: "inherit",
};

const COMPANY_STEPS = [
  { id: 1, label: "Company Information" },
  { id: 2, label: "Contract Details" },
  { id: 3, label: "Review & Save" },
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
        color: "#1D4ED8",
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
        background: disabled ? "#D1D5DB" : h ? "#1D4ED8" : BLUE,
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

function FormHeading({ title, subtitle }) {
  return (
    <div style={{ marginBottom: "32px" }}>
      <h2 style={{ fontSize: "18px", fontWeight: 600, color: DARK, lineHeight: "28px", letterSpacing: "0.72px", margin: "0 0 10px 0" }}>
        {title}
      </h2>
      <p style={{ fontSize: "14px", color: "#808080", lineHeight: "22px", letterSpacing: "0.42px", margin: 0 }}>
        {subtitle}
      </p>
    </div>
  );
}

const CalIconComponent = () => (
  <CalendarMonthIcon sx={{ fontSize: 16 }} />
);

/* ═══════════════════════════════════════════════════════════════
   STEP 1: COMPANY INFORMATION
═══════════════════════════════════════════════════════════════ */

function Step1({ data, onChange }) {
  const set = (k) => (e) => onChange({ ...data, [k]: e.target.value });

  return (
    <div style={{ maxWidth: "560px" }}>
      <FormHeading
        title="Add Company"
        subtitle="Enter basic company information."
      />

      <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
        <Field label="Company Name" required>
          <FInput
            type="text"
            placeholder="Enter company name"
            value={data.companyName}
            onChange={set("companyName")}
          />
        </Field>

        <Field label="Telephone Number" required>
          <FInput
            type="text"
            placeholder="Enter telephone number"
            value={data.telephoneNumber}
            onChange={set("telephoneNumber")}
          />
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          <Field label="P.O. Box" required>
            <FInput
              type="text"
              placeholder="Enter P.O. Box"
              value={data.poBox}
              onChange={set("poBox")}
            />
          </Field>
          <Field label="Fax Number" required>
            <FInput
              type="text"
              placeholder="Enter fax number"
              value={data.faxNumber}
              onChange={set("faxNumber")}
            />
          </Field>
        </div>

        <Field label="Company Address" required>
          <textarea
            placeholder="Enter company address"
            value={data.companyAddress}
            onChange={set("companyAddress")}
            rows={3}
            style={{
              ...baseInput,
              height: "84px",
              padding: "10px 12px",
              resize: "none",
            }}
            onFocus={(e) => {
              e.target.style.borderColor = BLUE;
              e.target.style.boxShadow = `0 0 0 3px rgba(44,95,234,0.10)`;
            }}
            onBlur={(e) => {
              e.target.style.borderColor = BORDER;
              e.target.style.boxShadow = "none";
            }}
          />
        </Field>

        <Field label="Tax Registration Number (TRN)" required>
          <FInput
            type="text"
            placeholder="Enter TRN"
            value={data.trn}
            onChange={set("trn")}
          />
        </Field>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   STEP 2: CONTRACT DETAILS
═══════════════════════════════════════════════════════════════ */

function Step2({ data, onChange }) {
  const set = (k) => (e) => onChange({ ...data, [k]: e.target.value });

  return (
    <div style={{ maxWidth: "560px" }}>
      <FormHeading
        title="Contract Period"
        subtitle="Define the active contract duration."
      />

      <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
        <Field label="Contract Start Date" required>
          <LocalizationProvider dateAdapter={AdapterDayjs}>
            <DatePicker
              format="DD/MM/YYYY"
              sx={{color:"#808080"}}
              value={data.contractStartDate ? dayjs(data.contractStartDate) : null}
              onChange={(newValue) => {
                onChange({
                  ...data,
                  contractStartDate: newValue ? newValue.format("DD/MM/YYYY") : "",
                });
              }}
              slotProps={{
                textField: {
                  fullWidth: true,
                  placeholder: "DD/MM/YYYY",
                  sx: {
                    color: "#808080",
                    "& .MuiOutlinedInput-root": {
                      height: "44px",
                      borderRadius: "8px",
                      "& fieldset": {
                        borderColor: "#DEDEDE",
                      },
                      "&:hover fieldset": {
                        borderColor: "#DEDEDE",
                      },
                      "&.Mui-focused fieldset": {
                        borderColor: "#DEDEDE",
                      },
                    },
                  },
                },
              }}
            />
          </LocalizationProvider>
        </Field>

        <Field label="Contract End Date" required>
          <LocalizationProvider dateAdapter={AdapterDayjs}>
            <DatePicker
              format="DD/MM/YYYY"
              sx={{color:"#808080"}}
              value={data.contractEndDate ? dayjs(data.contractEndDate) : null}
              onChange={(newValue) => {
                onChange({
                  ...data,
                  contractEndDate: newValue ? newValue.format("DD/MM/YYYY") : "",
                });
              }}
              slotProps={{
                textField: {
                  fullWidth: true,
                  placeholder: "DD/MM/YYYY",
                  sx: {
                    color: "#808080",
                    "& .MuiOutlinedInput-root": {
                      height: "44px",
                      borderRadius: "8px",
                      "& fieldset": {
                        borderColor: "#DEDEDE",
                      },
                      "&:hover fieldset": {
                        borderColor: "#DEDEDE",
                      },
                      "&.Mui-focused fieldset": {
                        borderColor: "#DEDEDE",
                      },
                    },
                  },
                },
              }}
            />
          </LocalizationProvider>
        </Field>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   STEP 3: REVIEW & SAVE
═══════════════════════════════════════════════════════════════ */

function Step3({ data }) {
  return (
    <div style={{ maxWidth: "560px" }}>
      <FormHeading
        title="Review Company Details"
        subtitle="Verify all information before saving."
      />

      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        {/* Company Details Section */}
        <div>
          <h3 style={{ fontSize: "13px", fontWeight: 600, color: DARK, margin: "0 0 12px 0", textTransform: "uppercase" }}>
            Company Details
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div>
              <p style={{ fontSize: "12px", color: GRAY, margin: 0 }}>Company Name:</p>
              <p style={{ fontSize: "14px", color: DARK, margin: "3px 0 0 0", fontWeight: 500 }}>{data.companyName}</p>
            </div>
            <div>
              <p style={{ fontSize: "12px", color: GRAY, margin: 0 }}>Telephone Number:</p>
              <p style={{ fontSize: "14px", color: DARK, margin: "3px 0 0 0", fontWeight: 500 }}>{data.telephoneNumber}</p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <div>
                <p style={{ fontSize: "12px", color: GRAY, margin: 0 }}>P.O. Box:</p>
                <p style={{ fontSize: "14px", color: DARK, margin: "3px 0 0 0", fontWeight: 500 }}>{data.poBox}</p>
              </div>
              <div>
                <p style={{ fontSize: "12px", color: GRAY, margin: 0 }}>Fax Number:</p>
                <p style={{ fontSize: "14px", color: DARK, margin: "3px 0 0 0", fontWeight: 500 }}>{data.faxNumber}</p>
              </div>
            </div>
            <div>
              <p style={{ fontSize: "12px", color: GRAY, margin: 0 }}>Company Address:</p>
              <p style={{ fontSize: "14px", color: DARK, margin: "3px 0 0 0", fontWeight: 500 }}>{data.companyAddress}</p>
            </div>
            <div>
              <p style={{ fontSize: "12px", color: GRAY, margin: 0 }}>Tax Registration Number (TRN):</p>
              <p style={{ fontSize: "14px", color: DARK, margin: "3px 0 0 0", fontWeight: 500 }}>{data.trn}</p>
            </div>
          </div>
        </div>

        {/* Company Details Section */}
        <div>
          <h3 style={{ fontSize: "13px", fontWeight: 600, color: DARK, margin: "0 0 12px 0", textTransform: "uppercase" }}>
            Company Details
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div>
              <p style={{ fontSize: "12px", color: GRAY, margin: 0 }}>Contract Start Date</p>
              <p style={{ fontSize: "14px", color: DARK, margin: "3px 0 0 0", fontWeight: 500 }}>{data.contractStartDate}</p>
            </div>
            <div>
              <p style={{ fontSize: "12px", color: GRAY, margin: 0 }}>Contract Start Date</p>
              <p style={{ fontSize: "14px", color: DARK, margin: "3px 0 0 0", fontWeight: 500 }}>{data.contractEndDate}</p>
            </div>
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
        minHeight: "100vh",
        background: "#F3F4F6",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      {/* BODY */}
      <div style={{ flex: 1, padding: "24px", minHeight: 0 }}>
        <div
          style={{
            display: "flex",
            minHeight: "100%",
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
              background: "#F9FAFB",
              borderRight: `1px solid ${BORDER}`,
              padding: "28px 20px",
              overflow: "visible",
            }}
          >
            <ReusableStepper currentStep={currentStep} steps={COMPANY_STEPS} />
          </div>

          {/* MAIN */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: "100%" }}>
            {/* Content area without scrolling */}
            <div style={{ display: "flex", flexDirection: "column", padding: "32px 24px", position: "relative", flex: "1 0 auto" }}>
              {isSuccess ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
                  <button
                    onClick={onBack}
                    style={backButtonStyle}
                    onMouseEnter={(e) => (e.currentTarget.style.background = LIGHT)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
                  >
                    <ChevronLeftIcon sx={{ fontSize: 16 }} />
                    Back to home
                  </button>
                  <button
                    onClick={onEdit}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "8px",
                      fontSize: "14px",
                      fontWeight: 500,
                      color: "#6B7280",
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
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "4px",
                    fontSize: "14px",
                    width: "75px",
                    height: "32px",
                    color: "#374151",
                    background: "#fff",
                    border: `1px solid #DEDEDE`,
                    borderRadius: "8px",
                    padding: "5px 12px",
                    cursor: "pointer",
                    marginBottom: "20px",
                    fontFamily: "inherit",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = LIGHT)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
                >
                  <ArrowBackIosIcon sx={{ fontSize: 12, transform: "translateX(-1px)" }}  />
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

function SuccessScreen({ onAssign }) {
  const SuccessCheckIcon = () => (
    <CheckCircleIcon sx={{ fontSize: 80, color: "#2C5FEA" }} />
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "16px", minHeight: "100%" }}>
      <SuccessCheckIcon />
      <h2 style={{ fontSize: "24px", fontWeight: 600, color: DARK, margin: 0 }}>
        Company added successfully
      </h2>
      <p style={{ fontSize: "14px", color: GRAY, margin: 0 }}>
        You can now assign employees and generate invoices.
      </p>
      <button
        onClick={onAssign}
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
          marginTop: "16px",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "#1E40AF")}
        onMouseLeave={(e) => (e.currentTarget.style.background = BLUE)}
      >
        Assign employees
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN ADD COMPANY COMPONENT
═══════════════════════════════════════════════════════════════ */

export default function AddCompany() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const [formData, setFormData] = useState({
    companyName: "",
    telephoneNumber: "",
    poBox: "",
    faxNumber: "",
    companyAddress: "",
    trn: "",
    contractStartDate: "",
    contractEndDate: "",
  });

  const handleDataChange = (newData) => {
    setFormData(newData);
  };

  const handleNext = async () => {
    if (currentStep < 3) {
      setCurrentStep(currentStep + 1);
      return;
    }

    try {
      setIsSaving(true);
      setSaveError("");

      await companiesApi.createCompany({
        name: formData.companyName.trim(),
        email: user?.email || `${formData.companyName.trim().toLowerCase().replace(/\s+/g, ".") || "company"}@example.com`,
        address: formData.companyAddress.trim(),
        telephoneNumber: formData.telephoneNumber.trim(),
        poBox: formData.poBox.trim(),
        faxNumber: formData.faxNumber.trim(),
        trn: formData.trn.trim(),
        contractStartDate: formData.contractStartDate,
        contractEndDate: formData.contractEndDate,
        companyRole: "client",
      });

      setIsSuccess(true);
    } catch (error) {
      setSaveError(error.response?.data?.message || "Failed to save company. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
      return;
    }

    navigate("/company");
  };

  const handleCancel = () => {
    navigate("/company");
  };

  const handleAssign = () => {
    navigate("/employees");
  };

  const handleEdit = () => {
    setIsSuccess(false);
    setCurrentStep(1);
  };

  /* ── Validation functions ── */
  const isStep1Valid = () => {
    return (
      formData.companyName &&
      formData.telephoneNumber &&
      formData.poBox &&
      formData.faxNumber &&
      formData.companyAddress &&
      formData.trn
    );
  };

  const isStep2Valid = () => {
    return formData.contractStartDate && formData.contractEndDate;
  };

  const getNextButtonDisabled = () => {
    if (currentStep === 1) return !isStep1Valid();
    if (currentStep === 2) return !isStep2Valid();
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
            <PrimaryBtn onClick={handleNext} disabled={getNextButtonDisabled() || isSaving}>
              {isSaving ? "Saving..." : currentStep === 3 ? "Save" : "Next"}
            </PrimaryBtn>
          </>
        )
      }
    >
      {saveError ? (
        <div style={{ marginBottom: "16px", color: "#B91C1C", fontSize: "14px" }}>{saveError}</div>
      ) : null}
      {isSuccess ? (
        <SuccessScreen onAssign={handleAssign} />
      ) : currentStep === 1 ? (
        <Step1 data={formData} onChange={handleDataChange} />
      ) : currentStep === 2 ? (
        <Step2 data={formData} onChange={handleDataChange} />
      ) : (
        <Step3 data={formData} />
      )}
    </Shell>
  );
}
