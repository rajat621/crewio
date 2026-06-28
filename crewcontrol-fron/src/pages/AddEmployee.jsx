import { useState, useRef, useMemo ,useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { employeesApi } from "../api/employees";
import { companiesApi } from "../api/companies";
import ReactCountryFlag from "react-country-flag";
import NotificationsNoneOutlinedIcon from "@mui/icons-material/NotificationsNoneOutlined";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ArrowBackIosIcon from '@mui/icons-material/ArrowBackIos';
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import BadgeOutlinedIcon from "@mui/icons-material/BadgeOutlined";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import WorkOutlineIcon from "@mui/icons-material/WorkOutline";
import AppRegistrationOutlinedIcon from "@mui/icons-material/AppRegistrationOutlined";
import EditIcon from "@mui/icons-material/Edit";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import BadgeIcon from "@mui/icons-material/Badge";
import VpnKeyIcon from "@mui/icons-material/VpnKey";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import DoneIcon from "@mui/icons-material/Done";
import { getCities, getCountries, getCountryByIso, getStates } from "../utils/locationService";
import { clampMobileByCountry, isValidMobileNumberByCountry } from "../utils/phoneValidation";

import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import dayjs from "dayjs";


/* ═══════════════════════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════════════════════ */

const GENDERS       = ["Male", "Female", "Other"];
// const TRADES        = ["Mason", "Carpenter", "Electrician", "Plumber", "Welder", "Helper"];
const EMP_TYPES     = ["Full Time", "Part Time", "Contract", "Daily Wage"];

const EMPLOYMENT_TYPE_MAP = {
  "Full Time": "full-time",
  "Part Time": "contract",
  Contract: "contract",
  "Daily Wage": "daily",
};

const EXPENSE_KEY_MAP = {
  "Offer Letter": "offerLetter",
  "Entry Permit": "entryPermit",
  "Tawjeeh Payment": "recruitment",
  "Visa Stamping": "stampingFee",
  "Emirates ID": "emiratesId",
  ILOE: "icn",
  "Emigration Card Cancellation": "emigrationCancellation",
  Insurance: "insurance",
  "Medical (MOH)": "medical",
  "Medical Insurance": "medicalInsurance",
  "Workman Compensation": "workersCompensation",
  "Labor Payment (Category 2)": "laborPaymentCategory2",
  "Labor Advance": "laborAdvance",
  "Labor PPE": "laborPRE",
  "Labor Mattress": "laborWPS",
  "Labor Utensils": "laborPayment",
  "Other equipment": "otherExpenses",
};

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const toIsoDate = (value) => {
  if (!value) return null;

  // Already in yyyy-mm-dd from native date input.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  // Accept dd/mm/yyyy format used in this flow.
  const parts = value.split("/");
  if (parts.length === 3) {
    const [dd, mm, yyyy] = parts;
    if (dd && mm && yyyy && yyyy.length === 4) {
      return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
    }
  }

  return null;
};

const mapExpensesForApi = (expenses) => {
  return Object.entries(expenses || {}).reduce((acc, [label, amount]) => {
    const mappedKey = EXPENSE_KEY_MAP[label];
    if (mappedKey) {
      acc[mappedKey] = parseFloat(amount) || 0;
    }
    return acc;
  }, {});
};

const mapExpenseReceiptsForApi = (expenseReceipts) => {
  return Object.entries(expenseReceipts || {}).reduce((acc, [label, fileData]) => {
    const mappedKey = EXPENSE_KEY_MAP[label];
    if (mappedKey && fileData) {
      acc[mappedKey] = fileData;
    }
    return acc;
  }, {});
};

/* ═══════════════════════════════════════════════════════════════
   SHARED STYLE TOKENS
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

const COUNTRY_OPTIONS = getCountries();
const DEFAULT_COUNTRY = getCountryByIso("AE") || COUNTRY_OPTIONS[0] || { isoCode: "AE", phoneCode: "+971", name: "United Arab Emirates" };

const MAIN_STEPS = [
  { id: 1, label: "Employee Details", icon: PersonOutlineIcon },
<<<<<<< HEAD
  { id: 2, label: "Upload Documents", icon: BadgeOutlinedIcon },
=======
  { id: 2, label: "Passport Details", icon: BadgeOutlinedIcon },
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
  { id: 3, label: "Expenses", icon: PaymentsOutlinedIcon },
  { id: 4, label: "Work Details", icon: WorkOutlineIcon },
  { id: 5, label: "App Access", icon: AppRegistrationOutlinedIcon },
];

const EXPENSE_SECTIONS = [
  {
    key: "recruitment",
    label: "Recruitment & Legal",
    items: [
      "Offer Letter",
      "Entry Permit",
      "Tawjeeh Payment",
      "Emirates ID",
      "Visa Stamping",
      "ILOE",
      "Emigration Card Cancellation",
    ],
  },
  {
    key: "insurance",
    label: "Insurance & Medical",
    items: ["Insurance", "Medical (MOH)", "Medical Insurance", "Workman Compensation"],
  },
  {
    key: "labor",
    label: "Labor & Advance Payments",
    items: ["Labor Payment (Category 2)", "Labor Advance"],
  },
  {
    key: "assets",
    label: "Employee Assets",
    subtitle: "Assets issued to the employee during onboarding.",
    items: ["Labor PPE", "Labor Mattress", "Labor Utensils", "Other equipment"],
  },
];

function Field({ label, required, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {label && (
        <label style={{ fontSize: "14px", color: "var(--text-primary)", display: "flex", gap: "2px", alignItems: "center" }}>
          {label}
          {required && <span style={{ color: "#F00" }}>*</span>}
        </label>
      )}
      {children}
    </div>
  );
}

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

/* ═══════════════════════════════════════════════════════════════
   SVG ICONS
═══════════════════════════════════════════════════════════════ */

const DocIcon = DescriptionOutlinedIcon;

const CheckIcon = () => (
  <DoneIcon sx={{ color: "#fff", fontSize: 18, fontWeight: "bold" }} />
);

const BellIcon = () => (
  <NotificationsNoneOutlinedIcon sx={{ fontSize: 20 }} />
);

const UserIcon = () => (
  <AccountCircleIcon sx={{ fontSize: 16 }} />
);

const UploadCloudIconComponent = () => (
  <CloudUploadIcon sx={{ fontSize: 48, color: "var(--text-disabled)" }} />
);

const CalIconComponent = () => (
  <CalendarMonthIcon sx={{ fontSize: 16 }} />
);

const WorkerIconComponent = () => (
  <BadgeIcon sx={{ fontSize: 28, color: "#fff" }} />
);

const KeyIconComponent = () => (
  <VpnKeyIcon sx={{ fontSize: 28, color: "#fff" }} />
);

const SuccessCheckIcon = () => (
  <CheckCircleIcon sx={{ fontSize: 80, color: "var(--color-primary)" }} />
);

/* ═══════════════════════════════════════════════════════════════
   SIDEBAR STEPPER
═══════════════════════════════════════════════════════════════ */

function Stepper({ currentStep, expenseSubStep }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {MAIN_STEPS.map((step, idx) => {
        const isCompleted = step.id < currentStep || (step.id === 3 && currentStep > 3);
        const isActive    = step.id === currentStep;
        const isLast      = idx === MAIN_STEPS.length - 1;
        const StepIcon = step.icon || DocIcon;

        // Show expense sub-steps only while step 3 is active or completed
        const showSubSteps = step.id === 3 && (isActive || currentStep > 3);

        return (
          <div key={step.id} style={{ position: "relative" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "16px" }}>
              <StepCircle completed={isCompleted} active={isActive} icon={StepIcon} />
              <div>
                <div style={{ fontSize: "8px", color: "var(--text-primary)", lineHeight: "14px", letterSpacing: "0.24px", textTransform: "uppercase" }}>
                  STEP {step.id}
                </div>
                <div style={{ fontSize: "14px", fontWeight: 500, lineHeight: "22px", letterSpacing: "0.42px", color: isActive || isCompleted ? DARK : "var(--text-primary)", marginTop: "0px" }}>
                  {step.label}
                </div>
              </div>
            </div>

            {!isLast && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", marginLeft: "22px" }}>
                {showSubSteps ? (
                  <div style={{ display: "flex", flexDirection: "column", width: "100%", paddingLeft: "0px" }}>
                    {EXPENSE_SECTIONS.map((sec, si) => {
                      const subCompleted = currentStep > 3 || (currentStep === 3 && si < expenseSubStep);
                      const subActive = currentStep === 3 && si === expenseSubStep;
                      return (
                        <div key={sec.key} style={{ display: "flex", alignItems: "flex-start", gap: "8px", marginTop: "8px" }}>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "44px", marginLeft: "-22px" }}>
                            <div style={{ width: "1px", height: "8px", background: BORDER }} />
                            <SubCircle completed={subCompleted} active={subActive} />
                            {si < EXPENSE_SECTIONS.length - 1 && (
                              <div style={{ width: "1px", flex: 1, minHeight: "8px", background: BORDER }} />
                            )}
                          </div>
                          <div style={{ fontSize: "12px", fontWeight: subActive || subCompleted ? 600 : 400, color: subActive || subCompleted ? DARK : "var(--text-disabled)", paddingTop: "8px", whiteSpace: "nowrap" }}>
                            {sec.label}
                          </div>
                        </div>
                      );
                    })}
                    <div style={{ width: "1px", height: "16px", background: BORDER, marginTop: "8px" }} />
                  </div>
                ) : (
                  <div style={{ width: "1px", height: "32px", background: isCompleted ? DARK : BORDER }} />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function StepCircle({ completed, active, icon: IconComponent = DocIcon }) {
  const DARK_LOCAL = "#111111";
  const GREY = "var(--text-disabled)";
  const LIGHT_BORDER = "var(--border-input-hover)";

  if (completed) {
    return (
      <div style={{ width: 44, height: 44, borderRadius: "50%", background: DARK_LOCAL, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <CheckIcon color="#fff" />
      </div>
    );
  }

  if (active) {
    return (
      <div style={{ width: 44, height: 44, borderRadius: "50%", border: `2px solid ${DARK_LOCAL}`, padding: 5, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, background: "#fff" }}>
        <div style={{ width: "100%", height: "100%", borderRadius: "50%", background: DARK_LOCAL, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <IconComponent sx={{ fontSize: 18, color: "#fff" }} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: 44, height: 44, borderRadius: "50%", border: `2px solid ${LIGHT_BORDER}`, padding: 5, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, background: "#fff" }}>
<<<<<<< HEAD
      <div style={{ width: "100%", height: "100%", borderRadius: "50%", background: "var(--bg-surface-secondary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
=======
      <div style={{ width: "100%", height: "100%", borderRadius: "50%", background: "#F3F4F6", display: "flex", alignItems: "center", justifyContent: "center" }}>
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
        <IconComponent sx={{ fontSize: 18, color: GREY }} />
      </div>
    </div>
  );
}

function SubCircle({ completed, active }) {
  const DARK = "#111111";
  const LIGHT_BORDER = "var(--border-input-hover)";
  // COMPLETED
  if (completed) {
    return (
      <div
        style={{
          width: 14,
          height: 14,
          borderRadius: "50%",
          background: DARK,
        }}
      />
    );
  }

  // ACTIVE (small double ring)
  if (active) {
    return (
      <div
        style={{
          width: 14,
          height: 14,
          borderRadius: "50%",
          border: `2px solid ${DARK}`,
          padding: 2,
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            borderRadius: "50%",
            background: DARK,
          }}
        />
      </div>
    );
  }

  // INACTIVE
  return (
    <div
      style={{
        width: 14,
        height: 14,
        borderRadius: "50%",
        border: `2px solid ${LIGHT_BORDER}`,
        background: "var(--bg-surface-secondary)",
      }}
    />
  );
}

/* ═══════════════════════════════════════════════════════════════
   LAYOUT SHELL
═══════════════════════════════════════════════════════════════ */

function Shell({ currentStep, expenseSubStep, children, footerContent, onBack, isSuccess }) {
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
            border: `1px solid var(--border-card)`,
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
            <Stepper currentStep={currentStep} expenseSubStep={expenseSubStep} />
          </div>

          {/* MAIN */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, height: "100%" }}>
            {/* Content area with independent scrolling */}
            <div className="thin-overlay-scroll" style={{ display: "flex", flexDirection: "column", padding: "32px 24px", position: "relative", flex: 1, minHeight: 0 }}>
              {isSuccess ? null : (
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
                    border: `1px solid var(--border-card)`,
                    borderRadius: "8px",
                    padding: "5px 12px",
                    cursor: "pointer",
                    marginBottom: "20px",
                    fontFamily: "inherit",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = LIGHT)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
                >
                  <ArrowBackIosIcon sx={{ fontSize: 12 ,    transform: "translateX(-1px)" }}  />
                  Back
                </button>
              )}

              {children}
            </div>

            {/* FOOTER */}
            <div
              style={{
                // borderTop: `1px solid ${BORDER}`,
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

/* ─── Footer Buttons ─── */
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

/* ─── Shared form heading ─── */
function FormHeading({ title, subtitle }) {
  return (
    <div style={{ marginBottom: "32px" }}>
      <h2 style={{ fontSize: "18px", fontWeight: 600, color: "var(--text-primary)", lineHeight: "28px", letterSpacing: "0.72px", margin: "0 0 10px 0" }}>{title}</h2>
      <p style={{ fontSize: "14px", color: "var(--text-secondary)", lineHeight: "22px",letterSpacing:"0.42px", margin: 0 }}>{subtitle}</p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   STEP 1: EMPLOYEE DETAILS
═══════════════════════════════════════════════════════════════ */

function Step1({ data, onChange }) {
const [showDropdown, setShowDropdown] = useState(false);
const [search, setSearch] = useState("");
const dropdownRef = useRef(null);
  const set = (k) => (e) => onChange({ ...data, [k]: e.target.value });
  const countries = useMemo(() => getCountries(), []);
  const phoneCountry = useMemo(
    () => getCountryByIso(data.phoneCountryIso) || DEFAULT_COUNTRY,
    [data.phoneCountryIso]
  );
const filteredCountries = useMemo(() => {
  if (!search) return countries;

  const lower = search.toLowerCase();

  return countries.filter((c) =>
    c.name.toLowerCase().includes(lower) ||
    c.phoneCode.includes(lower)
  );
}, [search, countries]);
  const nationalityCountry = useMemo(
    () => getCountryByIso(data.nationality) || DEFAULT_COUNTRY,
    [data.nationality]
  );
const stateOptions = useMemo(() => getStates(data.nationality), [data.nationality]);
const cityOptions = useMemo(() => getCities(data.nationality, data.state), [data.nationality, data.state]);
const handleNationalityChange = (e) => {
  onChange({
    ...data,
    nationality: e.target.value,
  });
};
useEffect(() => {
  const handleClickOutside = (event) => {
    if (
      dropdownRef.current &&
      !dropdownRef.current.contains(event.target)
    ) {
      setShowDropdown(false);
    }
  };

  document.addEventListener("mousedown", handleClickOutside);

  return () => {
    document.removeEventListener("mousedown", handleClickOutside);
  };
}, []);


  const handlePhoneCountryChange = (e) => {
    const nextIso = e.target.value;
    const nextCountry = getCountryByIso(nextIso) || DEFAULT_COUNTRY;
  onChange({
    ...data,
    phoneCountryIso: nextIso,
    countryCode: nextCountry.phoneCode,
    mobile: clampMobileByCountry(data.mobile, {
      countryIso: nextIso,
      countryCode: nextCountry.phoneCode,
    }),
  });
  };

  const handleStateChange = (e) => {
    onChange({
      ...data,
      state: e.target.value,
      city: "",
    });
  };

  return (
    <div style={{ maxWidth: "480px" }}>
      <FormHeading
        title="Employee Details"
        subtitle="Enter the employee's basic personal information."
      />
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <Field label="Emirates ID" required >
          <FInput
            type="text"
            placeholder="Enter Emirates ID"
            value={data.employeeId}
            onChange={set("employeeId")}
          />
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          <Field label="First Name" required>
            <FInput type="text" placeholder="Enter your First Name" value={data.firstName} onChange={set("firstName")} />
          </Field>
          <Field label="Last Name" required>
            <FInput type="text" placeholder="Enter your Last Name" value={data.lastName} onChange={set("lastName")} />
          </Field>
        </div>

        <Field label="Gender" required>
          <FSelect value={data.gender} onChange={set("gender")}>
            <option value="">Select</option>
            {GENDERS.map((g) => <option key={g}>{g}</option>)}
          </FSelect>
        </Field>

<Field label="Date of birth" required>
  <LocalizationProvider dateAdapter={AdapterDayjs}>
    <DatePicker
      format="DD/MM/YYYY"
      sx={{color:"var(--text-secondary)"}}
      value={data.dateOfBirth ? dayjs(data.dateOfBirth) : null}
      onChange={(newValue) => {
        onChange({
          ...data,
          dateOfBirth: newValue ? newValue.format("DD/MM/YYYY") : "",
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
                borderColor: "var(--border-card)", // default border
              },
              "&:hover fieldset": {
                borderColor: "var(--border-card)",
              },
              "&.Mui-focused fieldset": {
                borderColor: "var(--border-card)", // no blue on focus
              },
            },
          },
        },
      }}
    />
  </LocalizationProvider>
</Field>

<Field label="Mobile Number" required>
  <div style={{ display: "flex" }}>

    {/* Country Picker */}
    <div ref={dropdownRef} style={{ position: "relative", width: "180px" }}>
      
      {/* Selected */}
      <div
        onClick={() => setShowDropdown((prev) => !prev)}
        style={{
          ...baseInput,
          borderRadius: "8px 0 0 8px",
          borderRight: "none",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          cursor: "pointer",
        }}
      >
        <ReactCountryFlag
          countryCode={phoneCountry?.isoCode || "AE"}
          svg
          style={{ width: "18px", height: "12px" }}
        />
        <span>{phoneCountry?.phoneCode || "+971"}</span>
      </div>

      {/* Dropdown */}
      {showDropdown && (
        <div
          style={{
            position: "absolute",
            top: "46px",
            left: 0,
            width: "240px",
            maxHeight: "260px",
            border: `1px solid ${BORDER}`,
            borderRadius: "8px",
            background: "#fff",
            zIndex: 1000,
          }}
        >
          {/* Search */}
          <input
            type="text"
            placeholder="Search..."
            value={search || ""}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%",
              padding: "8px",
              border: "none",
              borderBottom: `1px solid ${BORDER}`,
              outline: "none",
            }}
          />

          {/* List */}
          <div style={{ maxHeight: "200px", overflowY: "auto" }}>
            {(countries || [])
              .filter((c) => {
                const s = (search || "").toLowerCase();
                return (
                  !s ||
                  c.name.toLowerCase().includes(s) ||
                  c.phoneCode.includes(s)
                );
              })
              .map((c) => (
                <div
                  key={c.isoCode}
                  onClick={() => {
                    handlePhoneCountryChange({
                      target: { value: c.isoCode },
                    });
                    setShowDropdown(false);
                    setSearch("");
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "8px 12px",
                    cursor: "pointer",
                  }}
                >
                  <ReactCountryFlag
                    countryCode={c.isoCode}
                    svg
                    style={{ width: "18px", height: "12px" }}
                  />
                  <span>{c.phoneCode}</span>
                  <span style={{ fontSize: "12px", color: "#888" }}>
                    {c.name}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>

    {/* Mobile Input */}
    <FInput
      type="text"
      placeholder="Enter your Mobile Number"
      value={data.mobile || ""}
      onChange={set("mobile")}
      style={{
        borderRadius: "0 8px 8px 0",
        borderLeft: `1px solid var(--border-input)`,
      }}
    />
  </div>
</Field>

        <Field label="Email">
          <FInput type="email" placeholder="Enter your Email ID" value={data.email} onChange={set("email")} />
        </Field>

        <Field label="Nationality" required>
          <div style={{ position: "relative" }}>
            <div style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none", display: "flex", alignItems: "center" }}>
              <ReactCountryFlag
                countryCode={nationalityCountry.isoCode}
                svg
                style={{ width: "18px", height: "12px", borderRadius: "2px" }}
              />
            </div>
            <FSelect value={data.nationality} onChange={handleNationalityChange} style={{ paddingLeft: "42px" }}>
              <option value="">Select country</option>
              {countries.map((country) => (
                <option key={country.isoCode} value={country.isoCode}>
                  {country.name}
                </option>
              ))}
            </FSelect>
          </div>
        </Field>

        <Field label="State" required>
          <FSelect value={data.state} onChange={handleStateChange}>
            <option value="">Select state</option>
            {stateOptions.map((state) => (
              <option key={state.isoCode} value={state.isoCode}>
                {state.name}
              </option>
            ))}
          </FSelect>
        </Field>

        <Field label="City" required>
          <FSelect value={data.city} onChange={set("city")}>
            <option value="">Select city</option>
            {cityOptions.map((city) => (
              <option key={city.name} value={city.name}>
                {city.name}
              </option>
            ))}
          </FSelect>
        </Field>

        <Field label="Address">
          <textarea
            placeholder="Enter address"
            value={data.address}
            onChange={set("address")}
            rows={3}
            style={{
              ...baseInput,
              height: "84px",
              padding: "10px 12px",
              resize: "none",
            }}
            onFocus={(e) => { e.target.style.borderColor = BLUE; e.target.style.boxShadow = `0 0 0 3px rgba(44,95,234,0.10)`; }}
            onBlur={(e)  => { e.target.style.borderColor = BORDER; e.target.style.boxShadow = "none"; }}
          />
        </Field>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   STEP 2: PASSPORT DETAILS
═══════════════════════════════════════════════════════════════ */

function Step2({ data, onChange }) {
  const set = (k) => (e) => onChange({ ...data, [k]: e.target.value });
  const passportRef = useRef();
  const emiratesRef = useRef();
  const laborRef = useRef();
  const medicalRef = useRef();
  const residenceRef = useRef();
  const contractRef = useRef();
  const [dragging, setDragging] = useState(false);

  const handleFile = async (field, file) => {
    if (!file) return;

    try {
      const dataUrl = await readFileAsDataUrl(file);
      onChange({ ...data, [field]: dataUrl || file.name });
    } catch (error) {
      onChange({ ...data, [field]: file.name });
    }
  };

  const getUploadText = (value, fallback) => {
    if (!value) return fallback;
    if (typeof value === "string" && value.startsWith("data:")) return "Uploaded file";
    return value;
  };

  const renderDropZone = (label, field, inputRef, placeholder) => (
    <Field label={label}>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFile(field, e.dataTransfer.files[0]);
        }}
        style={{
<<<<<<< HEAD
          border: `1.5px dashed ${dragging ? BLUE : "var(--border-input-hover)"}`,
=======
          border: `1.5px dashed ${dragging ? BLUE : "#D1D5DB"}`,
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
          borderRadius: "10px",
          padding: "40px 24px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "8px",
<<<<<<< HEAD
          background: dragging ? "#EFF4FF" : "var(--bg-surface)",
=======
          background: dragging ? "#EFF4FF" : "#FAFAFA",
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
          cursor: "pointer",
        }}
        onClick={() => inputRef.current.click()}
      >
        <UploadCloudIconComponent />
        <p style={{ fontSize: "14px", color: DARK, margin: 0 }}>
          {getUploadText(data[field], placeholder)}
        </p>
        <p style={{ fontSize: "12px", color: GRAY, margin: 0, fontStyle: "italic" }}>
          Accepted formats: PDF, JPG, PNG (Max 5MB)
        </p>
        <p style={{ fontSize: "13px", color: GRAY, margin: "4px 0" }}>- OR -</p>
        <button
          onClick={(e) => {
            e.stopPropagation();
            inputRef.current.click();
          }}
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
        ref={inputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        style={{ display: "none" }}
        onChange={(e) => handleFile(field, e.target.files[0])}
      />
    </Field>
  );

  return (
    <div style={{ maxWidth: "560px" }}>
      <FormHeading
        title="Upload Documents"
        subtitle="Provide passport and identity information for verification and compliance."
      />

      <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
        <Field label="Passport No">
          <FInput type="text" placeholder="Enter passport number" value={data.passportNo} onChange={set("passportNo")} />
        </Field>

        <Field label="Passport Expiry Date">
          <LocalizationProvider dateAdapter={AdapterDayjs}>
            <DatePicker
              format="DD/MM/YYYY"
              sx={{color:"var(--text-secondary)"}}
              value={data.passportExpiry ? dayjs(data.passportExpiry) : null}
              onChange={(newValue) => {
                onChange({
                  ...data,
                  passportExpiry: newValue ? newValue.format("DD/MM/YYYY") : "",
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

        {renderDropZone("Upload Passport Copy", "passportCopy", passportRef, "Drag & drop passport copy here")}

        <Field label="Emirates ID">
          <FInput type="text" placeholder="Enter Emirates ID" value={data.emiratesId} onChange={set("emiratesId")} />
        </Field>

        <Field label="Emirates ID Expiry Date">
          <LocalizationProvider dateAdapter={AdapterDayjs}>
            <DatePicker
              format="DD/MM/YYYY"
<<<<<<< HEAD
              sx={{ color: "var(--text-secondary)" }}
=======
              sx={{ color: "#808080" }}
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
              value={data.emiratesIdExpiry ? dayjs(data.emiratesIdExpiry) : null}
              onChange={(newValue) => {
                onChange({
                  ...data,
                  emiratesIdExpiry: newValue ? newValue.format("DD/MM/YYYY") : "",
                });
              }}
              slotProps={{
                textField: {
                  fullWidth: true,
                  placeholder: "DD/MM/YYYY",
                  sx: {
<<<<<<< HEAD
                    color: "var(--text-secondary)",
=======
                    color: "#808080",
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
                    "& .MuiOutlinedInput-root": {
                      height: "44px",
                      borderRadius: "8px",
                      "& fieldset": {
<<<<<<< HEAD
                        borderColor: "var(--border-card)",
                      },
                      "&:hover fieldset": {
                        borderColor: "var(--border-card)",
                      },
                      "&.Mui-focused fieldset": {
                        borderColor: "var(--border-card)",
=======
                        borderColor: "#DEDEDE",
                      },
                      "&:hover fieldset": {
                        borderColor: "#DEDEDE",
                      },
                      "&.Mui-focused fieldset": {
                        borderColor: "#DEDEDE",
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
                      },
                    },
                  },
                },
              }}
            />
          </LocalizationProvider>
        </Field>

        {renderDropZone("Upload Emirates Card Copy", "emiratesIdCopy", emiratesRef, "Drag & drop Emirates card copy here")}
        {renderDropZone("Upload Labor Card Copy", "laborCardCopy", laborRef, "Drag & drop labor card copy here")}
        {renderDropZone("Upload Medical Certificate Copy", "medicalCertificateCopy", medicalRef, "Drag & drop medical certificate copy here")}
        {renderDropZone("Upload Residence ID Copy", "residenceIdCopy", residenceRef, "Drag & drop residence ID copy here")}
        {renderDropZone("Upload Contract Paper Copy", "contractPaperCopy", contractRef, "Drag & drop contract paper copy here")}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   STEP 3: EXPENSES (sub-step table)
═══════════════════════════════════════════════════════════════ */

function ExpenseRow({ label, value, onChange, receiptValue, onUpload }) {
  const [f, setF] = useState(false);
  const uploadRef = useRef(null);

  const uploadLabel =
    receiptValue && typeof receiptValue === "string"
      ? receiptValue.startsWith("data:")
        ? "Uploaded"
        : receiptValue
      : "Upload";

  return (
    <tr>
      <td style={{ padding: "10px 0", fontSize: "14px", color: DARK }}>{label}</td>
      <td style={{ padding: "10px 16px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            border: `1px solid ${f ? BLUE : BORDER}`,
            borderRadius: "6px",
            overflow: "hidden",
            width: "140px",
            boxShadow: f ? `0 0 0 3px rgba(44,95,234,0.10)` : "none",
          }}
        >
          <input
            type="number"
            min="0"
            step="0.01"
            value={value}
            onChange={onChange}
            onFocus={() => setF(true)}
            onBlur={() => setF(false)}
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              padding: "6px 10px",
              fontSize: "14px",
              height: "44px",
              color: DARK,
              background: "#fff",
              fontFamily: "inherit",
              width: "80px",
            }}
          />
          <span
            style={{
              padding: "0 10px",
              fontSize: "13px",
              color: GRAY,
              borderLeft: `1px solid ${BORDER}`,
              background: LIGHT,
              height: "100%",
              display: "flex",
              alignItems: "center",
              userSelect: "none",
            }}
          >
            AED
          </span>
        </div>
      </td>
      <td style={{ padding: "10px 0" }}>
        <button
          type="button"
          onClick={() => uploadRef.current?.click()}
          style={{
            background: "none",
            border: "none",
            color: BLUE,
            fontSize: "14px",
            fontWeight: 500,
            cursor: "pointer",
            padding: 0,
            fontFamily: "inherit",
          }}
        >
          {uploadLabel}
        </button>
        <input
          ref={uploadRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          style={{ display: "none" }}
          onChange={(e) => onUpload?.(e.target.files?.[0])}
        />
      </td>
    </tr>
  );
}

function Step3({ expenseSubStep, data, onChange, expenseReceipts, onReceiptChange }) {
  const section = EXPENSE_SECTIONS[expenseSubStep];
  const total   = Object.values(data).reduce((s, v) => s + (parseFloat(v) || 0), 0);

  const setVal = (item) => (e) => onChange({ ...data, [item]: e.target.value });
  const setReceipt = (item) => async (file) => {
    if (!file) return;

    try {
      const dataUrl = await readFileAsDataUrl(file);
      onReceiptChange({ ...expenseReceipts, [item]: dataUrl || file.name });
    } catch (error) {
      onReceiptChange({ ...expenseReceipts, [item]: file.name });
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <FormHeading
          title="Employee Expenses"
          subtitle="Record recurring or one-time expenses associated with the employee."
        />
        {/* Total Expenses Card */}
        <div
          style={{
            border: `1px solid var(--border-card)`,
            borderRadius: "8px",
            background: "var(--bg-surface-secondary)",
            padding: "24px 59px 24px 20px",
            height:"110px",
            width: "240px",
            textAlign: "left",
            flexShrink: 0,
            marginLeft: "24px",
          }}
        >
          <div style={{ fontSize: "16px",lineHeight: "26px" ,color: "var(--text-secondary)" , marginBottom: "4px" }}>Total Expenses (AED)</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: "4px" }}>
            <span style={{ fontSize: "28px", fontWeight: 700, color: DARK }}>{total.toFixed(2)}</span>
            <span style={{ fontSize: "13px", color: GRAY }}>/ employee</span>
          </div>
        </div>
      </div>

      {/* Section heading */}
      <div style={{ marginBottom: "20px" }}>
        <span style={{ fontSize: "15px", fontWeight: 600, color: DARK }}>{section.label}</span>
        {section.subtitle && (
          <span style={{ fontSize: "13px", color: GRAY, marginLeft: "8px", fontStyle: "italic" }}>{section.subtitle}</span>
        )}
      </div>

      {/* Table */}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
            <th style={{ padding: "8px 0", fontSize: "13px", fontWeight: 500, color: GRAY, textAlign: "left" }}>Expense Type</th>
            <th style={{ padding: "8px 16px", fontSize: "13px", fontWeight: 500, color: GRAY, textAlign: "left" }}>Amount (AED)</th>
            <th style={{ padding: "8px 0", fontSize: "13px", fontWeight: 500, color: GRAY, textAlign: "left" }}>Receipt</th>
          </tr>
        </thead>
        <tbody>
          {section.items.map((item) => (
            <ExpenseRow
              key={item}
              label={item}
              value={data[item] ?? "0.00"}
              onChange={setVal(item)}
              receiptValue={expenseReceipts?.[item]}
              onUpload={setReceipt(item)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   STEP 4: WORK DETAILS
═══════════════════════════════════════════════════════════════ */

function Step4({ data, onChange }) {
  const set = (k) => (e) => onChange({ ...data, [k]: e.target.value });

  return (
    <div style={{ maxWidth: "560px" }}>
      <FormHeading title="Work Details" subtitle="Define the employee's role and compensation details." />

      <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
<Field label="Trade">
  <FInput
    type="text"
    placeholder="Enter trade"
    value={data.trade}
    onChange={set("trade")}
  />
</Field>

        <Field label="Joining Date">
          <LocalizationProvider dateAdapter={AdapterDayjs}>
            <DatePicker
              format="DD/MM/YYYY"
              sx={{color:"var(--text-secondary)"}}
              value={data.joiningDate ? dayjs(data.joiningDate) : null}
              onChange={(newValue) => {
                onChange({
                  ...data,
                  joiningDate: newValue ? newValue.format("DD/MM/YYYY") : "",
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

        <Field label="Rate per Hour (AED)">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              border: `1px solid ${BORDER}`,
              borderRadius: "8px",
              overflow: "hidden",
            }}
          >
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={data.ratePerHour}
              onChange={set("ratePerHour")}
              style={{
                flex: 1,
                border: "none",
                outline: "none",
                padding: "0 12px",
                height: "44px",
                fontSize: "14px",
                color: DARK,
                background: "#fff",
                fontFamily: "inherit",
              }}
              onFocus={(e) => { e.target.parentElement.style.borderColor = BLUE; e.target.parentElement.style.boxShadow = `0 0 0 3px rgba(44,95,234,0.10)`; }}
              onBlur={(e)  => { e.target.parentElement.style.borderColor = BORDER; e.target.parentElement.style.boxShadow = "none"; }}
            />
            <span
              style={{
                padding: "0 14px",
                fontSize: "14px",
                color: GRAY,
                borderLeft: `1px solid ${BORDER}`,
                height: "44px",
                display: "flex",
                alignItems: "center",
                background: LIGHT,
                userSelect: "none",
              }}
            >
              AED
            </span>
          </div>
        </Field>

        <Field label="Employment Type">
          <FSelect value={data.employmentType} onChange={set("employmentType")}>
            <option value="">Select Type</option>
            {EMP_TYPES.map((t) => <option key={t}>{t}</option>)}
          </FSelect>
        </Field>

        <Field label="Overtime Rate (optional)">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              border: `1px solid ${BORDER}`,
              borderRadius: "8px",
              overflow: "hidden",
            }}
          >
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={data.overtimeRate}
              onChange={set("overtimeRate")}
              style={{
                flex: 1,
                border: "none",
                outline: "none",
                padding: "0 12px",
                height: "44px",
                fontSize: "14px",
                color: DARK,
                background: "#fff",
                fontFamily: "inherit",
              }}
              onFocus={(e) => { e.target.parentElement.style.borderColor = BLUE; e.target.parentElement.style.boxShadow = `0 0 0 3px rgba(44,95,234,0.10)`; }}
              onBlur={(e)  => { e.target.parentElement.style.borderColor = BORDER; e.target.parentElement.style.boxShadow = "none"; }}
            />
            <span
              style={{
                padding: "0 14px",
                fontSize: "14px",
                color: GRAY,
                borderLeft: `1px solid ${BORDER}`,
                height: "44px",
                display: "flex",
                alignItems: "center",
                background: LIGHT,
                userSelect: "none",
              }}
            >
              AED
            </span>
          </div>
        </Field>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   STEP 5: APP ACCESS (generated credentials)
═══════════════════════════════════════════════════════════════ */

function Step5({ userId, password }) {

  return (
    <div style={{ maxWidth: "560px" }}>
      <FormHeading
        title="App Access"
        subtitle="Generate login credentials for the employee mobile app."
      />

      <div
        style={{
          border: `1px solid ${BORDER}`,
          borderRadius: "10px",
          padding: "32px 24px",
          background: LIGHT,
        }}
      >
        <h3 style={{ fontSize: "16px", fontWeight: 600, color: DARK, textAlign: "center", margin: "0 0 28px 0" }}>
          User ID and Password Generated
        </h3>

        {/* User ID block */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", marginBottom: "20px" }}>
          <div
            style={{
              width: "52px",
              height: "52px",
              borderRadius: "50%",
              background: DARK,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <WorkerIconComponent />
          </div>
          <p style={{ fontSize: "13px", color: GRAY, margin: 0 }}>User ID</p>
          <p style={{ fontSize: "18px", fontWeight: 700, color: DARK, margin: 0, letterSpacing: "1px" }}>
            {userId || "employee0001"}
          </p>
        </div>

        {/* Divider with AND */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", margin: "16px 0" }}>
          <div style={{ flex: 1, height: "1px", background: BORDER }} />
          <span style={{ fontSize: "12px", color: GRAY, fontWeight: 500 }}>AND</span>
          <div style={{ flex: 1, height: "1px", background: BORDER }} />
        </div>

        {/* Password block */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", marginTop: "20px" }}>
          <div
            style={{
              width: "52px",
              height: "52px",
              borderRadius: "50%",
              background: DARK,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <KeyIconComponent />
          </div>
          <p style={{ fontSize: "13px", color: GRAY, margin: 0 }}>Password</p>
          <p style={{ fontSize: "18px", fontWeight: 700, color: DARK, margin: 0, letterSpacing: "1px" }}>
            {password || "Crew@1234"}
          </p>
        </div>

        <p style={{ fontSize: "12px", color: GRAY, textAlign: "center", margin: "20px 0 0 0" }}>
          These credentials are stored securely and used by the employee to log in to the mobile app.
        </p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SUCCESS SCREEN
═══════════════════════════════════════════════════════════════ */

function SuccessScreen({ onOpenAssign, onBackHome, onEdit }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "600px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "36px" }}>
        <button
          type="button"
          onClick={onBackHome}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "4px",
            fontSize: "14px",
            width: "130px",
            height: "32px",
<<<<<<< HEAD
            color: "var(--text-secondary)",
            background: "#fff",
            border: `1px solid var(--border-card)`,
=======
            color: "#6B7280",
            background: "#fff",
            border: `1px solid #DEDEDE`,
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
            borderRadius: "8px",
            padding: "5px 12px",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          <ArrowBackIosIcon sx={{ fontSize: 12, transform: "translateX(-1px)" }} />
          Back to home
        </button>
        <button
          type="button"
          onClick={onEdit}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            fontSize: "14px",
            height: "32px",
<<<<<<< HEAD
            color: "var(--text-secondary)",
            background: "#fff",
            border: `1px solid var(--border-card)`,
=======
            color: "#6B7280",
            background: "#fff",
            border: `1px solid #DEDEDE`,
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
            borderRadius: "8px",
            padding: "0 14px",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          <EditIcon sx={{ fontSize: 14 }} />
          Edit
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "20px", minHeight: "420px" }}>
        <SuccessCheckIcon />
        <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 600, color: DARK, textAlign: "center" }}>
          Employee Added Successfully!
        </h2>
<<<<<<< HEAD
        <p style={{ margin: 0, fontSize: "14px", color: "var(--text-secondary)", textAlign: "center", maxWidth: "740px", fontWeight: 400 }}>
=======
        <p style={{ margin: 0, fontSize: "14px", color: "#757575", textAlign: "center", maxWidth: "740px", fontWeight: 400 }}>
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
          The employee profile has been created and is ready for assignment.
        </p>
        <button
          type="button"
          onClick={onOpenAssign}
          style={{
            marginTop: "18px",
            minWidth: "180px",
            height: "32px",
            borderRadius: "8px",
            border: "none",
            background: BLUE,
            color: "#fff",
            fontSize: "12px",
            fontWeight: 500,
            cursor: "pointer",
            fontFamily: "inherit",
            padding: "0 22px",
          }}
        >
          Assign to company
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════════ */

function AddEmployee() {
  const navigate = useNavigate();

  /* ── Navigation state ── */
  const [currentStep,    setCurrentStep]    = useState(1);
  const [expenseSubStep, setExpenseSubStep] = useState(0); // 0-3 within step 3

  /* ── Form state ── */
  const [step1Data, setStep1Data] = useState({
    employeeId: "",
    firstName: "",
    lastName: "",
    gender: "",
    dateOfBirth: "",
    phoneCountryIso: DEFAULT_COUNTRY.isoCode, // ✅ NEW
    countryCode: DEFAULT_COUNTRY.phoneCode,
    mobile: "",
    email: "",
    nationality: DEFAULT_COUNTRY.isoCode,
    state: "",
    city: "",
    address: "",
  });

  const [step2Data, setStep2Data] = useState({
    passportNo: "",
    passportExpiry: "",
    passportCopy: "",
    emiratesId: "",
    emiratesIdExpiry: "",
    emiratesIdCopy: "",
    laborCardCopy: "",
    medicalCertificateCopy: "",
    residenceIdCopy: "",
    contractPaperCopy: "",
  });

  const [expenseData, setExpenseData] = useState({});
  const [expenseReceipts, setExpenseReceipts] = useState({});

  const [step4Data, setStep4Data] = useState({
    trade: "", joiningDate: "", ratePerHour: "", employmentType: "", overtimeRate: "",
  });

  const [generatedCredentials, setGeneratedCredentials] = useState({ userId: "", password: "" });
  const [createdEmployeeId, setCreatedEmployeeId] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [companyOptions, setCompanyOptions] = useState([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [companyLoading, setCompanyLoading] = useState(false);
  const [assigningCompany, setAssigningCompany] = useState(false);
  const [assignError, setAssignError] = useState("");

  const handleStep1Change = (nextStep1) => {
    setStep1Data(nextStep1);
    setStep2Data((prev) => ({ ...prev, emiratesId: nextStep1.employeeId || "" }));
  };

  const handleStep2Change = (nextStep2) => {
    setStep2Data(nextStep2);
    setStep1Data((prev) => ({ ...prev, employeeId: nextStep2.emiratesId || "" }));
  };

  const loadClientCompanies = async () => {
    try {
      setCompanyLoading(true);
      setAssignError("");
      let rawRows = [];

      try {
        const response = await companiesApi.getClientCompanies({ page: 1, limit: 500 });
        rawRows = Array.isArray(response?.data?.data)
          ? response.data.data
          : Array.isArray(response?.data?.companies)
            ? response.data.companies
            : [];
      } catch (error) {
        const fallbackResponse = await companiesApi.getCompanies({ page: 1, limit: 500 });
        rawRows = Array.isArray(fallbackResponse?.data?.data)
          ? fallbackResponse.data.data
          : Array.isArray(fallbackResponse?.data?.companies)
            ? fallbackResponse.data.companies
            : [];
      }

      const clients = rawRows
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

      setCompanyOptions(clients);
      setSelectedCompanyId(clients[0]?.id || "");
    } catch (error) {
      setAssignError("Unable to load client companies. Please try again.");
    } finally {
      setCompanyLoading(false);
    }
  };

  const handleOpenAssignModal = async () => {
    setAssignModalOpen(true);
    if (!createdEmployeeId) {
      setAssignError("Employee ID missing. Please add the employee again.");
      return;
    }
    await loadClientCompanies();
  };

  const handleCloseAssignModal = () => {
    setAssignModalOpen(false);
    setAssignError("");
  };

  const handleAssignCompany = async () => {
    if (!createdEmployeeId || !selectedCompanyId) {
      setAssignError("Please select a company.");
      return;
    }

    try {
      setAssigningCompany(true);
      setAssignError("");
      await employeesApi.assignEmployee(createdEmployeeId, selectedCompanyId);
      handleCloseAssignModal();
      navigate("/employees");
    } catch (error) {
      setAssignError(error?.response?.data?.message || "Unable to assign company. Please try again.");
    } finally {
      setAssigningCompany(false);
    }
  };

  /* ── Navigation handlers ── */
  const handleNext = async () => {
    if (currentStep === 1) { setCurrentStep(2); return; }
    if (currentStep === 2) { setCurrentStep(3); setExpenseSubStep(0); return; }
    if (currentStep === 3) {
      if (expenseSubStep < EXPENSE_SECTIONS.length - 1) {
        setExpenseSubStep((s) => s + 1);
      } else {
        setCurrentStep(4);
      }
      return;
    }
    if (currentStep === 4) {
      try {
        setIsSubmitting(true);
        const payload = {
          employeeId: step1Data.employeeId,
          emiratesId: step2Data.emiratesId || step1Data.employeeId,
          firstName: step1Data.firstName,
          lastName: step1Data.lastName,
          gender: step1Data.gender,
          dateOfBirth: toIsoDate(step1Data.dateOfBirth),
          phoneCountryIso: step1Data.phoneCountryIso,
          countryCode: step1Data.countryCode,
          mobile: `${step1Data.countryCode} ${step1Data.mobile}`.trim(),
          mobileNumber: `${step1Data.countryCode} ${step1Data.mobile}`.trim(),
          email: step1Data.email || null,
          nationality: step1Data.nationality,
          state: step1Data.state || null,
          city: step1Data.city || null,
          address: step1Data.address || null,
          trade: step4Data.trade || null,
          joiningDate: toIsoDate(step4Data.joiningDate),
          ratePerHour: parseFloat(step4Data.ratePerHour) || 0,
          employmentType: EMPLOYMENT_TYPE_MAP[step4Data.employmentType] || "full-time",
          overtimeRate: parseFloat(step4Data.overtimeRate) || 0,
          passportNo: step2Data.passportNo || null,
          passportExpiry: toIsoDate(step2Data.passportExpiry),
          passportCopy: step2Data.passportCopy || null,
          emiratesIdExpiry: toIsoDate(step2Data.emiratesIdExpiry),
          emiratesIdCopy: step2Data.emiratesIdCopy || null,
          laborCardCopy: step2Data.laborCardCopy || null,
          medicalCertificateCopy: step2Data.medicalCertificateCopy || null,
          residenceIdCopy: step2Data.residenceIdCopy || null,
          contractPaperCopy: step2Data.contractPaperCopy || null,
          expenses: mapExpensesForApi(expenseData),
          expenseReceipts: mapExpenseReceiptsForApi(expenseReceipts),
        };

        const response = await employeesApi.createEmployee(payload);
        const creds = response?.data?.employee || response?.data?.data || {};
        setCreatedEmployeeId(creds?._id || "");

        const nextUserId = creds.appUserId || creds.userId || creds.employeeId || "";
        const isHashedPassword = /^\$2[aby]\$\d{2}\$/.test(String(creds.appPassword || ""));
        const nextPassword = creds.password || (!isHashedPassword ? creds.appPassword : `${nextUserId}@123`);

        setGeneratedCredentials({
          userId: nextUserId,
          password: nextPassword,
        });
        setSubmitError("");
        setCurrentStep(5);
      } catch (error) {
        setSubmitError(
          error?.response?.data?.message ||
          error?.response?.data?.error ||
          "Unable to create employee. Please try again."
        );
      } finally {
        setIsSubmitting(false);
      }
      return;
    }
    if (currentStep === 5) { setCurrentStep(6); return; }
  };

  const handleBack = () => {
    setSubmitError("");
    if (currentStep === 1) { navigate("/employees"); return; }
    if (currentStep === 2) { setCurrentStep(1); return; }
    if (currentStep === 3) {
      if (expenseSubStep > 0) { setExpenseSubStep((s) => s - 1); }
      else                   { setCurrentStep(2); }
      return;
    }
    if (currentStep === 4) { setCurrentStep(3); setExpenseSubStep(EXPENSE_SECTIONS.length - 1); return; }
    if (currentStep === 5) { setCurrentStep(4); return; }
  };

  const handleCancel = () => navigate("/employees");

  /* ── Validation functions ── */
  const isStep1Valid = () => {
    return (
      step1Data.employeeId &&   // ✅ ADD THIS
      step1Data.firstName &&
      step1Data.lastName &&
      step1Data.gender &&
      step1Data.dateOfBirth &&
      step1Data.mobile &&
      step1Data.nationality &&
      step1Data.state &&
      step1Data.city
    );
  };

  const isStep4Valid = () => {
    return step4Data.joiningDate && step4Data.employmentType;
  };

  const getNextButtonDisabled = () => {
    if (currentStep === 1) return !isStep1Valid();
    if (currentStep === 4) return !isStep4Valid() || isSubmitting;
    return false;
  };

  /* ── Footer button label ── */
  const nextLabel = () => {
    if (currentStep === 4) return isSubmitting ? "Saving..." : "Next";
    if (currentStep === 5) return "Done";
    return "Next";
  };

  const handlePrimary = async () => {
    if (currentStep === 6) {
      await handleOpenAssignModal();
      return;
    }
    await handleNext();
  };

  const handleBackToEmployees = () => {
    navigate("/employees");
  };

  const handleEditCreatedEmployee = () => {
    if (!createdEmployeeId) {
      navigate("/employees");
      return;
    }

    navigate(`/employees/${createdEmployeeId}?edit=true`);
  };

  const isSuccess = currentStep === 6;

  return (
    <Shell
      currentStep={currentStep}
      expenseSubStep={expenseSubStep}
      onBack={handleBack}
      isSuccess={isSuccess}
      footerContent={
        isSuccess ? (
          null
        ) : (
          <>
            <CancelBtn onClick={handleCancel} />
            <PrimaryBtn onClick={handlePrimary} disabled={getNextButtonDisabled()}>
              {nextLabel()}
            </PrimaryBtn>
          </>
        )
      }
    >
      {currentStep === 1 && <Step1 data={step1Data} onChange={handleStep1Change} />}
      {currentStep === 2 && <Step2 data={step2Data} onChange={handleStep2Change} />}
      {currentStep === 3 && (
        <Step3
          expenseSubStep={expenseSubStep}
          data={expenseData}
          onChange={setExpenseData}
          expenseReceipts={expenseReceipts}
          onReceiptChange={setExpenseReceipts}
        />
      )}
      {currentStep === 4 && <Step4 data={step4Data} onChange={setStep4Data} />}
      {submitError && currentStep !== 6 && (
        <div style={{ color: "#B91C1C", fontSize: "13px", marginTop: "14px" }}>
          {submitError}
        </div>
      )}
      {currentStep === 5 && <Step5 userId={generatedCredentials.userId} password={generatedCredentials.password} />}
      {currentStep === 6 && (
        <SuccessScreen
          onOpenAssign={handleOpenAssignModal}
          onBackHome={handleBackToEmployees}
          onEdit={handleEditCreatedEmployee}
        />
      )}

      {assignModalOpen && (
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
          onClick={handleCloseAssignModal}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "808px",
              minHeight: "500px",
              background: "#fff",
<<<<<<< HEAD
              border: "1px solid var(--border-card)",
=======
              border: "1px solid #DEDEDE",
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
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
<<<<<<< HEAD
                borderBottom: "1px solid var(--border-card)",
=======
                borderBottom: "1px solid #DEDEDE",
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0 18px",
              }}
            >
<<<<<<< HEAD
              <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 600, color: "var(--text-primary)", letterSpacing: "0.54px",lineHeight: "20px" }}>
=======
              <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 600, color: "#141414", letterSpacing: "0.54px",lineHeight: "20px" }}>
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
                Assign to Company
              </h3>
              <button
                type="button"
                onClick={handleCloseAssignModal}
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
<<<<<<< HEAD
              <label style={{ display: "block", fontSize: "14px", color: "var(--text-primary)", marginBottom: "12px", fontWeight: 400 }}>
=======
              <label style={{ display: "block", fontSize: "14px", color: "#111827", marginBottom: "12px", fontWeight: 400 }}>
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
                Select a company
              </label>
              <select
                className="assign-company-select"
                value={selectedCompanyId}
                onChange={(event) => setSelectedCompanyId(event.target.value)}
                disabled={companyLoading || assigningCompany}
                style={{
                  width: "100%",
                  maxWidth: "560px",
                  height: "44px",
                  borderRadius: "8px",
                  padding: "0 40px 0 14px",
                  fontSize: "14px",
<<<<<<< HEAD
                  color: "var(--text-primary)",
=======
                  color: "#141414",
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
                  background: "#fff",
                  fontFamily: "inherit",
                  appearance: "none",
                  WebkitAppearance: "none",
                  MozAppearance: "none",

                  backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 20 20' fill='none'><path d='M5 7L10 12L15 7' stroke='%23141414' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/></svg>")`,
                  backgroundRepeat: "no-repeat",

                  // exact caret position from right
                  backgroundPosition: "right 12px center",

                  backgroundSize: "12px",
                }}
              >
                {!companyLoading && !companyOptions.length && <option value="">No client companies found</option>}
                {companyLoading && <option value="">Loading companies...</option>}
                {companyOptions.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>

              {assignError && (
                <p style={{ color: "#B91C1C", fontSize: "13px", margin: "14px 0 0" }}>
                  {assignError}
                </p>
              )}
            </div>
{/* div for button */}
            <div
              style={{
<<<<<<< HEAD
                borderTop: "1px solid var(--border-card)",
=======
                borderTop: "1px solid #DEDEDE",
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
                height: "68px",
                display: "flex",
                justifyContent: "flex-end",
                alignItems: "center",
                padding: "0 20px",
              }}
            >
              <button
                type="button"
                onClick={handleAssignCompany}
                disabled={assigningCompany || companyLoading || !selectedCompanyId}
                style={{
                  minWidth: "71px",
                  height: "32px",
                  borderRadius: "8px",
                  border: "none",
                  padding: "0 16px",
                  fontSize: "12px",
                  fontWeight: 500,
                  color: "#fff",
<<<<<<< HEAD
                  background: assigningCompany || companyLoading || !selectedCompanyId ? "var(--text-disabled)" : BLUE,
=======
                  background: assigningCompany || companyLoading || !selectedCompanyId ? "#9CA3AF" : BLUE,
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
                  cursor: assigningCompany || companyLoading || !selectedCompanyId ? "not-allowed" : "pointer",
                  fontFamily: "inherit",
                }}
              >
                {assigningCompany ? "Assigning..." : "Assign"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}

export default AddEmployee;

