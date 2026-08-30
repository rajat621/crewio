import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { renderToStaticMarkup } from "react-dom/server";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import NorthEastIcon from "@mui/icons-material/NorthEast";
import SouthWestIcon from "@mui/icons-material/SouthWest";
import PersonIcon from "@mui/icons-material/Person";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import dayjs from "dayjs";
import jsPDF from "jspdf";
import { employeesApi } from "../../api/employees";
import { expensesApi } from "../../api/expenses";
import { useOwnerCompany, useOwnerCompanyAsset } from "../../hooks/useOwnerCompany";
import { useEmployees } from "../../hooks/useEmployees";
import { useSalarySlipForEdit } from "../../hooks/useSalarySlipForEdit";
import { salarySlipsApi } from "../../api/salarySlips";
import { useSaveSalarySlipMutation } from "../../hooks/mutations/useSalarySlipGenerationMutations";
import SearchableSelect from "../../components/common/SearchableSelect";
/* ═══════════════════════════════════════════════════════════════
   CONSTANTS
   (kept identical to GenerateTaxInvoice.jsx so both screens share
   one visual language)
═══════════════════════════════════════════════════════════════ */

const BLUE = "var(--color-primary)";
const DARK = "var(--text-primary)";
const GRAY = "var(--text-secondary)";
const BORDER = "var(--border-card)";
const LIGHT = "var(--bg-surface)";
const SURFACE_SECONDARY = "var(--bg-surface-secondary)";

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

// "Advance Deduction" here means deducting from an advance the employee
// was ALREADY given previously - it draws down their existing balance, so
// it's capped against expenseReport.remainAmount (see balanceValidationError
// below) same as before. This is a different thing from the separate
// "Add Advance" section further down the form, which GIVES the employee a
// brand new advance right now (an addition to Expense History, not capped
// by anything here - see handleAddAdvance/SLIP_TO_EXPENSE_TYPE).
// Every other type below behaves like a penalty: enterable irrespective of
// the employee's remaining balance.
const DEDUCTION_TYPES = ["Penalty Amount", "Gas", "Advance Deduction", "Other (Food)", "Other (Travel)", "Other"];

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const TRADES = ["Carpenter", "Electrician", "Plumber", "Painter", "Welder", "Mason", "Laborer"];

// The printable slip is opened in its own browser tab / rasterized into a
// PDF, so it can't rely on the app's CSS variables — plain hex colors only.
const SLIP_DARK = "#1F2937";
const SLIP_BODY = "#374151";
const SLIP_MUTED = "#6B7280";
const SLIP_DIVIDER = "#E5E7EB";
const SLIP_FOOTER_BG = "#F5F3FF";
const SLIP_AVATAR_BG = "#C7C9D6";
const SLIP_AVATAR_FG = "#5F5E72";

// Same set of "deduction-like" type strings the Expenses page treats as
// reducing the advance balance (kept in sync with Expenses.jsx). The
// "* deduction" variants are what Gas/Other(Food)/Other(Travel)/Other are
// tagged with when added from THIS screen's Add Deduction section, so they
// never get confused with a same-category expense added normally via the
// Expenses page's Add Expense (which stays a plain "gas"/"food"/"travel"
// addition, not a deduction).
const DEDUCTION_TYPE_SET = new Set([
  "deduction", "fine", "penalty", "penalty amount", "advance deduction",
  "gas deduction", "food deduction", "travel deduction", "other deduction",
]);

// Empty/neutral shape used before an employee's real expense data has
// been fetched, so the UI has something sane to render.
const EMPTY_EXPENSE_REPORT = {
  totalExpense: 0,
  gas: 0,
  advance: 0,
  otherFood: 0,
  otherTravel: 0,
  remainAmount: 0,
  history: [],
};

/* ═══════════════════════════════════════════════════════════════
   PRIMITIVE COMPONENTS
   (FInput / FSelect / CancelBtn / PrimaryBtn / Field / FormHeading
   are copied as-is from GenerateTaxInvoice.jsx)
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

// Input with an "AED" prefix or a "Days" / "Hr" suffix, styled to match
// the same box used by FInput / FSelect.
function UnitInput({ prefix, suffix, value, onChange, type = "text", placeholder, step }) {
  const [f, setF] = useState(false);
  return (
    <div
      style={{
        ...baseInput,
        display: "flex",
        alignItems: "center",
        gap: "6px",
        ...(f ? { borderColor: BLUE, boxShadow: `0 0 0 3px rgba(44,95,234,0.10)` } : {}),
      }}
    >
      {prefix && (
        <span style={{ fontSize: "14px", color: GRAY, flexShrink: 0 }}>{prefix}</span>
      )}
      <input
        type={type}
        step={step}
        inputMode={type === "number" ? "decimal" : undefined}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        onFocus={() => setF(true)}
        onBlur={() => setF(false)}
        style={{
          flex: 1,
          minWidth: 0,
          border: "none",
          outline: "none",
          background: "transparent",
          fontSize: "14px",
          color: DARK,
          fontFamily: "inherit",
          padding: 0,
          appearance: "textfield",
          WebkitAppearance: "none",
          MozAppearance: "textfield",
        }}
      />
      {suffix && (
        <span style={{ fontSize: "14px", color: GRAY, flexShrink: 0 }}>{suffix}</span>
      )}
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

// Small bordered "chip" button used for "Add" and "View Report".
function OutlineBtn({ onClick, children, icon, disabled }) {
  const [h, setH] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        height: "32px",
        padding: "0 14px",
        border: `1px solid ${BORDER}`,
        borderRadius: "8px",
        background: disabled ? SURFACE_SECONDARY : h ? LIGHT : "#fff",
        color: GRAY,
        fontSize: "13px",
        fontWeight: 500,
        cursor: disabled ? "not-allowed" : "pointer",
        fontFamily: "inherit",
        whiteSpace: "nowrap",
        opacity: disabled ? 0.6 : 1,
      }}
      onMouseEnter={() => !disabled && setH(true)}
      onMouseLeave={() => !disabled && setH(false)}
    >
      {icon}
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

// Right-column stat card (Salary Slip No. / Calculated Salary / etc.),
// styled the same way as the "Company Name" / "Invoice No." cards in
// GenerateTaxInvoice.jsx.
function InfoCard({ label, value, suffix, children }) {
  return (
    <div
      style={{
        background: SURFACE_SECONDARY,
        border: `1px solid ${BORDER}`,
        borderRadius: "8px",
        padding: "20px",
        marginBottom: "16px",
      }}
    >
      <p style={{ fontSize: "13px", color: GRAY, margin: 0, marginBottom: "10px", lineHeight: "20px" }}>
        {label}
      </p>
      <p style={{ fontSize: "28px", fontWeight: 600, color: DARK, margin: 0, lineHeight: "32px" }}>
        {value}
        {suffix && (
          <span style={{ fontSize: "13px", fontWeight: 400, color: GRAY, marginLeft: "6px" }}>
            {suffix}
          </span>
        )}
      </p>
      {children}
    </div>
  );
}

// Small circular "$" icon with a direction arrow, used in the Expense
// Report panel's payment history list. Red for money going out
// (deductions), green for money coming in (regular additions) - matches
// the same color coding used on the Expenses page and the mobile app's
// View Advance screen.
const DEDUCTION_COLOR = "#B4232F";
const ADDITION_COLOR = "#157347";

function MoneyFlowIcon({ direction }) {
  const ArrowIcon = direction === "out" ? NorthEastIcon : SouthWestIcon;
  const flowColor = direction === "out" ? DEDUCTION_COLOR : ADDITION_COLOR;
  return (
    <div
      style={{
        width: "28px",
        height: "28px",
        borderRadius: "50%",
        border: `1px solid ${flowColor}`,
        background: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        flexShrink: 0,
      }}
    >
      <span style={{ fontSize: "12px", fontWeight: 700, color: flowColor }}>$</span>
      <ArrowIcon
        sx={{
          fontSize: 12,
          position: "absolute",
          top: direction === "out" ? -4 : "auto",
          bottom: direction === "in" ? -4 : "auto",
          right: direction === "out" ? -4 : "auto",
          left: direction === "in" ? -4 : "auto",
          color: flowColor,
          background: "#fff",
          borderRadius: "50%",
        }}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SUCCESS SCREEN / DIALOG
   (same pattern as GenerateTaxInvoice.jsx's SuccessScreen / SuccessDialog)
═══════════════════════════════════════════════════════════════ */

function SuccessScreen({ employeeName, onPreview, onDownload }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "16px" }}>
      <CheckCircleIcon sx={{ fontSize: 80, color: "var(--color-primary)" }} />
      <h2 style={{ fontSize: "20px", fontWeight: 600, color: DARK, margin: 0 }}>
        Salary Slip Generated Successfully!
      </h2>
      <p style={{ fontSize: "14px", color: GRAY, margin: 0, maxWidth: "360px" }}>
        {employeeName} Salary Slip has been created and is ready to view or download.
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
          Preview Slip
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

function SuccessDialog({ employeeName, onPreview, onDownload, onClose }) {
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
          position: "relative",
          width: "100%",
          maxWidth: "480px",
          background: "#fff",
          borderRadius: "20px",
          boxShadow: "0 24px 80px var(--shadow-popover)",
          padding: "32px",
          textAlign: "center",
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: "16px",
            right: "16px",
            width: "28px",
            height: "28px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "none",
            background: "transparent",
            borderRadius: "50%",
            cursor: "pointer",
            color: GRAY,
          }}
        >
          <CloseIcon sx={{ fontSize: 18 }} />
        </button>
        <SuccessScreen employeeName={employeeName} onPreview={onPreview} onDownload={onDownload} />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PRINTABLE SALARY SLIP (A5)
   One shared shape of data (see buildSlipData in the main component)
   feeds both the on-screen / new-tab HTML version below and the
   vector PDF generator (generateSalarySlipPdf) further down.
═══════════════════════════════════════════════════════════════ */

function SlipDivider() {
  return <div style={{ height: "1px", background: SLIP_DIVIDER, margin: "0 32px" }} />;
}

function SlipRow({ label, value, bold }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
      <span style={{ fontSize: "13.5px", fontWeight: bold ? 700 : 400, color: bold ? SLIP_DARK : SLIP_BODY }}>
        {label}
      </span>
      <span style={{ fontSize: "13.5px", fontWeight: bold ? 700 : 400, color: bold ? SLIP_DARK : SLIP_BODY, whiteSpace: "nowrap" }}>
        {value}
      </span>
    </div>
  );
}

function SlipEmployeeRow({ label, value }) {
  return (
    <div style={{ display: "flex", gap: "8px" }}>
      <span style={{ width: "150px", flexShrink: 0, fontSize: "13.5px", color: SLIP_MUTED }}>{label}</span>
      <span style={{ fontSize: "13.5px", color: SLIP_DARK, fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function SlipSection({ heading, subheading, rows, total }) {
  return (
    <div>
      <div style={{ padding: "22px 32px 14px" }}>
        <p style={{ fontSize: "15px", fontWeight: 700, color: SLIP_DARK, margin: 0 }}>
          {heading}
          {subheading && (
            <span style={{ fontWeight: 400, fontStyle: "italic", color: SLIP_DARK }}> {subheading}</span>
          )}
        </p>
      </div>
      <SlipDivider />
      <div style={{ padding: "14px 32px", display: "flex", flexDirection: "column", gap: "11px" }}>
        {rows.map((row) => (
          <SlipRow key={row.label} label={row.label} value={row.value} />
        ))}
      </div>
      <SlipDivider />
      <div style={{ padding: "14px 32px" }}>
        <SlipRow label={total.label} value={total.value} bold />
      </div>
    </div>
  );
}

// Renders the full A5 slip. Used for the "Preview" tab (via
// renderToStaticMarkup) — the PDF download is drawn separately with jsPDF
// for crisp, selectable text rather than a rasterized screenshot.
function SalarySlipDocument({ data }) {
  return (
    <div
      style={{
        width: "100%",
        maxWidth: "560px",
        background: "#fff",
        fontFamily: "Arial, Helvetica, sans-serif",
        color: SLIP_BODY,
      }}
    >
      {/* HEADER */}
      <div style={{ padding: "32px 32px 24px", display: "flex", gap: "20px", alignItems: "flex-start" }}>
        <div
          style={{
            width: "70px",
            height: "70px",
            borderRadius: "50%",
            background: SLIP_AVATAR_BG,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            overflow: "hidden",
          }}
        >
          {data.companyLogo ? (
            <img
              src={data.companyLogo}
              alt="company logo"
              style={{ width: 46, height: 46, borderRadius: "50%", objectFit: "cover" }}
            />
          ) : (
            <img
              src={
                `data:image/svg+xml;base64,${btoa(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' fill='%23ffffff'/><g fill='%234a5568'><rect x='14' y='8' width='36' height='48' rx='2'/><rect x='20' y='14' width='6' height='6'/><rect x='30' y='14' width='6' height='6'/><rect x='40' y='14' width='6' height='6'/><rect x='20' y='26' width='6' height='6'/><rect x='30' y='26' width='6' height='6'/><rect x='40' y='26' width='6' height='6'/><rect x='20' y='38' width='6' height='6'/><rect x='30' y='38' width='6' height='6'/><rect x='40' y='38' width='6' height='6'/></g></svg>`)}
              `
              }
              alt="default logo"
              style={{ width: 46, height: 46, borderRadius: "50%", objectFit: "cover" }}
            />
          )}
        </div>
        <div>
          <p style={{ fontSize: "26px", fontWeight: 700, color: SLIP_DARK, margin: "0 0 6px 0" }}>
            {data.companyName}
          </p>
          <p style={{ fontSize: "15px", color: SLIP_MUTED, margin: "0 0 4px 0" }}>{data.companyPhone}</p>
          <p style={{ fontSize: "15px", color: SLIP_MUTED, margin: 0 }}>
            Pay Slip for <span style={{ color: SLIP_DARK, fontWeight: 600 }}>{data.payMonth} {data.payYear}</span>
          </p>
        </div>
      </div>

      <SlipDivider />

      {/* EMPLOYEE DETAILS */}
      <div style={{ padding: "20px 32px", display: "flex", flexDirection: "column", gap: "9px" }}>
        <SlipEmployeeRow label="Employee Name :" value={data.employee.name} />
        <SlipEmployeeRow label="Emirates ID :" value={data.employee.emiratesId} />
        <SlipEmployeeRow label="Trade :" value={data.employee.trade} />
        <SlipEmployeeRow label="Total Day Worked :" value={`${data.employee.totalDaysWorked} Days`} />
        <SlipEmployeeRow label="Total Hour Worked :" value={`${data.employee.totalHoursWorked} hr`} />
      </div>

      <SlipDivider />

      <SlipSection
        heading="Your Earnings"
        subheading="(This Month)"
        rows={[
          { label: "Calculated Salary (Rate x Hours)", value: `AED ${data.earnings.calculatedSalary.toFixed(2)}` },
          { label: "Additional Allowances", value: `AED ${data.earnings.additionalAllowances.toFixed(2)}` },
        ]}
        total={{ label: "Gross Salary", value: `AED ${data.earnings.grossSalary.toFixed(2)}` }}
      />

      <SlipSection
        heading="Deductions Amount"
        rows={data.deductionRows.map((row) => ({ label: row.label, value: `AED ${row.value.toFixed(2)}` }))}
        total={{ label: "Total Deduction", value: `AED ${data.totalDeduction.toFixed(2)}` }}
      />

      <SlipSection
        heading="Advance Summary"
        rows={[
          { label: "Total Advance Given", value: `AED ${data.advance.totalGiven.toFixed(2)}` },
          { label: "This Month Deduction", value: `AED ${data.advance.thisMonthDeduction.toFixed(2)}` },
          { label: "This Month Advance Given", value: `AED ${Number(data.advance.thisMonthGiven || 0).toFixed(2)}` },
        ]}
        total={{ label: "Remaining Advance", value: `AED ${data.advance.remaining.toFixed(2)}` }}
      />

      <div style={{ height: "18px" }} />

      {/* NET SALARY */}
      <div
        style={{
          background: SLIP_FOOTER_BG,
          padding: "26px 32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span style={{ fontSize: "19px", fontWeight: 700, color: SLIP_DARK }}>
          Net Salary <span style={{ fontWeight: 400, fontStyle: "italic" }}>(In Hand )</span>
        </span>
        <span style={{ fontSize: "21px", fontWeight: 700, color: SLIP_DARK }}>
          AED {data.netSalary.toFixed(2)}
        </span>
      </div>
    </div>
  );
}

// Builds the full HTML document used for the "Preview Slip" tab. The page
// renders as an actual A5 sheet on screen (not just at print time) — the
// body is a light-gray canvas behind a fixed 148mm x 210mm white "page"
// that holds the slip, so what you see in the tab is what prints / matches
// the PDF.
const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));

export function buildSlipPreviewHtml(data) {
  const slipHtml = renderToStaticMarkup(<SalarySlipDocument data={data} />);
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Salary Slip - ${escapeHtml(data.employee.name)}</title>
    <style>
      @page { size: A5; margin: 0; }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; }
      body {
        background: #E5E7EB;
        display: flex;
        justify-content: center;
        padding: 24px 0;
        min-height: 100vh;
      }
      .a5-page {
        width: 148mm;
        min-height: 210mm;
        background: #fff;
        box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12);
        overflow: hidden;
        display: flex;
        justify-content: center;
      }
      .a5-page > div { width: 100%; }
      @media print {
        body { background: #fff; padding: 0; }
        .a5-page { box-shadow: none; width: 148mm; min-height: 210mm; }
      }
    </style>
  </head>
  <body>
    <div class="a5-page">${slipHtml}</div>
  </body>
</html>`;
}

// Draws the same layout directly with jsPDF so the downloaded file is a
// real, crisp, selectable-text PDF (rather than a rasterized screenshot),
// sized to an actual A5 page (148 x 210mm).
export async function generateSalarySlipPdf(data) {
  // Ensure companyLogo is a data URI (fetch remote image and convert if needed)
  async function urlToDataUri(url) {
    try {
      const resp = await fetch(url);
      if (!resp.ok) return null;
      const contentType = resp.headers.get('content-type') || '';
      const arrayBuffer = await resp.arrayBuffer();
      let binary = '';
      const bytes = new Uint8Array(arrayBuffer);
      const len = bytes.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);
      return `data:${contentType};base64,${base64}`;
    } catch (e) {
      return null;
    }
  }

  // The logo is only ever drawn at 16x16mm (see addImage below), but
  // without this, whatever the company actually uploaded - often a
  // multi-megapixel logo file - gets embedded byte-for-byte at full
  // resolution, which is the single biggest driver of an oversized salary
  // slip PDF. Downscales via <canvas> (no server round-trip needed for
  // this) and re-compresses as JPEG, which is far smaller than PNG for a
  // photographic/scanned logo. Never throws - falls back to the original
  // data URI on any failure so a working logo can't regress to missing.
  const MAX_LOGO_DIMENSION = 200;
  async function optimizeLogoDataUri(dataUri) {
    try {
      const image = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = dataUri;
      });
      if (image.width <= MAX_LOGO_DIMENSION && image.height <= MAX_LOGO_DIMENSION) {
        return dataUri;
      }
      const scale = MAX_LOGO_DIMENSION / Math.max(image.width, image.height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.82);
    } catch (e) {
      return dataUri;
    }
  }

  if (data?.companyLogo && typeof data.companyLogo === 'string' && !data.companyLogo.startsWith('data:')) {
    const resolved = await urlToDataUri(data.companyLogo);
    if (resolved) data.companyLogo = resolved;
  }

  if (data?.companyLogo && typeof data.companyLogo === 'string' && data.companyLogo.startsWith('data:')) {
    data.companyLogo = await optimizeLogoDataUri(data.companyLogo);
  }

  const doc = new jsPDF({ unit: "mm", format: "a5", orientation: "portrait" });
  const pageWidth = 148;
  const marginX = 12;
  const rightX = pageWidth - marginX;
  let y = 16;

  const drawDivider = (yy) => {
    doc.setDrawColor(SLIP_DIVIDER);
    doc.setLineWidth(0.2);
    doc.line(marginX, yy, rightX, yy);
  };

  const drawRow = (label, value, yy, { bold = false } = {}) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(10);
    doc.setTextColor(bold ? SLIP_DARK : SLIP_BODY);
    doc.text(label, marginX, yy);
    doc.text(value, rightX, yy, { align: "right" });
  };

  const drawSection = (heading, subheading, rows, total) => {
    y += 10;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(SLIP_DARK);
    doc.text(heading, marginX, y);
    if (subheading) {
      const headingWidth = doc.getTextWidth(heading);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9.5);
      doc.text(subheading, marginX + headingWidth + 1.6, y);
    }
    y += 4;
    drawDivider(y);
    y += 5;
    rows.forEach((row) => {
      drawRow(row.label, row.value, y);
      y += 5.4;
    });
    y += 0.4;
    drawDivider(y);
    y += 5;
    drawRow(total.label, total.value, y, { bold: true });
  };

  // Header: avatar + company info
  if (data.companyLogo && typeof data.companyLogo === "string" && data.companyLogo.startsWith("data:image")) {
    try {
      // draw image inside the avatar circle (16x16)
      const imgX = marginX; // marginX + 8 - 8
      const imgY = y - 4;   // (y+4) - 8
      doc.addImage(data.companyLogo, data.companyLogo.startsWith("data:image/png") ? "PNG" : data.companyLogo.startsWith("data:image/jpeg") || data.companyLogo.startsWith("data:image/jpg") ? "JPEG" : "PNG", imgX, imgY, 16, 16);
    } catch (e) {
      // fallback to drawn avatar
      doc.setFillColor(SLIP_AVATAR_BG);
      doc.circle(marginX + 8, y + 4, 8, "F");
      doc.setFillColor(SLIP_AVATAR_FG);
      doc.circle(marginX + 8, y + 1.5, 2.6, "F");
      doc.ellipse(marginX + 8, y + 8, 4.6, 2.8, "F");
    }
  } else {
    doc.setFillColor(SLIP_AVATAR_BG);
    doc.circle(marginX + 8, y + 4, 8, "F");
    doc.setFillColor(SLIP_AVATAR_FG);
    doc.circle(marginX + 8, y + 1.5, 2.6, "F");
    doc.ellipse(marginX + 8, y + 8, 4.6, 2.8, "F");
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(SLIP_DARK);
  doc.text(data.companyName, marginX + 21, y + 1);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(SLIP_MUTED);
  doc.text(data.companyPhone, marginX + 21, y + 7);

  doc.text("Pay Slip for", marginX + 21, y + 13);
  const payForWidth = doc.getTextWidth("Pay Slip for ");
  doc.setFont("helvetica", "bold");
  doc.setTextColor(SLIP_DARK);
  doc.text(`${data.payMonth} ${data.payYear}`, marginX + 21 + payForWidth, y + 13);

  y += 17;
  drawDivider(y);
  y += 6;

  // Employee details
  const empRows = [
    ["Employee Name :", data.employee.name],
    ["Emirates ID :", data.employee.emiratesId],
    ["Trade :", data.employee.trade],
    ["Total Day Worked :", `${data.employee.totalDaysWorked} Days`],
    ["Total Hour Worked :", `${data.employee.totalHoursWorked} hr`],
  ];
  doc.setFontSize(10);
  empRows.forEach(([label, value]) => {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(SLIP_MUTED);
    doc.text(label, marginX, y);
    doc.setTextColor(SLIP_DARK);
    doc.text(String(value), marginX + 38, y);
    y += 5.4;
  });
  y += 0.4;
  drawDivider(y);

  drawSection(
    "Your Earnings",
    "(This Month)",
    [
      { label: "Calculated Salary (Rate x Hours)", value: `AED ${data.earnings.calculatedSalary.toFixed(2)}` },
      { label: "Additional Allowances", value: `AED ${data.earnings.additionalAllowances.toFixed(2)}` },
    ],
    { label: "Gross Salary", value: `AED ${data.earnings.grossSalary.toFixed(2)}` }
  );

  drawSection(
    "Deductions Amount",
    null,
    data.deductionRows.map((row) => ({ label: row.label, value: `AED ${row.value.toFixed(2)}` })),
    { label: "Total Deduction", value: `AED ${data.totalDeduction.toFixed(2)}` }
  );

  drawSection(
    "Advance Summary",
    null,
    [
      { label: "Total Advance Given", value: `AED ${data.advance.totalGiven.toFixed(2)}` },
      { label: "This Month Deduction", value: `AED ${data.advance.thisMonthDeduction.toFixed(2)}` },
      { label: "This Month Advance Given", value: `AED ${Number(data.advance.thisMonthGiven || 0).toFixed(2)}` },
    ],
    { label: "Remaining Advance", value: `AED ${data.advance.remaining.toFixed(2)}` }
  );

  // Net Salary footer band — fills to the bottom of the A5 page.
  const pageHeight = 210;
  const footerHeight = 20;
  doc.setFillColor(SLIP_FOOTER_BG);
  doc.rect(0, pageHeight - footerHeight, pageWidth, footerHeight, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(SLIP_DARK);
  doc.text("Net Salary", marginX, pageHeight - 8);
  const netLabelWidth = doc.getTextWidth("Net Salary ");
  doc.setFont("helvetica", "italic");
  doc.setFontSize(11);
  doc.text("(In Hand )", marginX + netLabelWidth, pageHeight - 8);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(`AED ${data.netSalary.toFixed(2)}`, rightX, pageHeight - 8, { align: "right" });

  // Return a Blob so callers can open in new tab or trigger download similarly to invoices
  const blob = doc.output('blob');
  return blob;
}

/* ═══════════════════════════════════════════════════════════════
   LIVE EXPENSE DATA HELPERS
   Replaces the old static EXPENSE_REPORT demo constant. These mirror
   the normalisation logic in Expenses.jsx so "Total Advance Given" /
   "Remaining Advance" on the slip always match what the Expenses page
   shows for the same employee.
═══════════════════════════════════════════════════════════════ */

function formatDateLabel(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function normalizeExpenseType(type = "", note = "") {
  const raw = String(type || note || "other").trim().toLowerCase();
  if (!raw) return "other";
  if (DEDUCTION_TYPE_SET.has(raw)) return "deduction";
  if (raw === "gas") return "gas";
  if (raw === "advance") return "advance";
  if (raw === "food") return "other food";
  if (raw === "travel") return "other travel";
  return raw;
}

// Same shape Expenses.jsx builds per employee, but trimmed to what the
// salary-slip screen actually needs (Expense Report panel + Advance
// Summary section of the printable slip).
function summarizeEmployeeExpenseRecords(records = []) {
  const normalized = records
    .map((record) => ({
      type: normalizeExpenseType(record?.type, record?.note),
      label: record?.note || record?.type || "Expense",
      amount: Number(record?.amount || 0),
      date: record?.date || new Date().toISOString(),
    }))
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  const isDeductionType = (type) => DEDUCTION_TYPE_SET.has(type) || type === "deduction";

  const totalAdvance = normalized
    .filter((r) => r.type === "advance")
    .reduce((sum, r) => sum + r.amount, 0);

  const deduction = normalized
    .filter((r) => isDeductionType(r.type))
    .reduce((sum, r) => sum + r.amount, 0);

  const gas = normalized.filter((r) => r.type === "gas").reduce((sum, r) => sum + r.amount, 0);
  const otherFood = normalized.filter((r) => r.type === "other food").reduce((sum, r) => sum + r.amount, 0);
  const otherTravel = normalized.filter((r) => r.type === "other travel").reduce((sum, r) => sum + r.amount, 0);

  const totalExpense = normalized
    .filter((r) => !isDeductionType(r.type))
    .reduce((sum, r) => sum + r.amount, 0);

  const history = normalized.map((r) => ({
    type: isDeductionType(r.type) ? "deduction" : "taken",
    label: r.label,
    date: formatDateLabel(r.date),
    amount: r.amount,
  }));

  return {
    totalExpense,
    gas,
    advance: totalAdvance,
    otherFood,
    otherTravel,
    remainAmount: Math.max(0, totalAdvance - deduction),
    totalAdvanceGiven: totalAdvance,
    totalDeductedSoFar: deduction,
    history,
  };
}

function getEmployeeSearchValue(employee = {}) {
  return `${employee?.name || ""} ${employee?.firstName || ""} ${employee?.lastName || ""} ${employee?.emiratesId || ""} ${employee?.employeeId || ""}`
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/* ═══════════════════════════════════════════════════════════════
   MAIN GENERATE SALARY SLIP COMPONENT
═══════════════════════════════════════════════════════════════ */

export default function GenerateSalarySlip() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Present -> this screen is editing an existing slip (see Salary Slip
  // page's new Edit action) instead of generating a new one. Deliberately
  // never lets the employee/month/year change once in edit mode - that's
  // what generating a fresh slip is for, and it's what the backend's
  // updateSalarySlip endpoint enforces too.
  const editId = searchParams.get("editId");
  const isEditMode = Boolean(editId);
  const [editLoading, setEditLoading] = useState(isEditMode);
  const [editLoadError, setEditLoadError] = useState("");
  // Synchronous guard against a rapid double-click on Generate/Update
  // creating two slips - see useSubmitGuard.js for why a ref beats a
  // plain state flag here. isGenerating (state) drives the button's
  // disabled/loading-text UI; generateGuardRef (ref) is the actual
  // airtight lock.
  const generateGuardRef = useRef(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const [showExpenseReport, setShowExpenseReport] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [slipError, setSlipError] = useState("");

  // Snapshot of the exact data used to generate the slip — captured once
  // in handleGenerate and reused by both Preview and Download, so they
  // always show precisely what was generated rather than recomputing from
  // (possibly since-changed) form state.
  const [generatedSlipData, setGeneratedSlipData] = useState(null);

  // Live expense data for whichever employee is currently in the form,
  // fetched on demand (Add Deduction / View Report) — see fetchExpenseReport.
  const [expenseReport, setExpenseReport] = useState(EMPTY_EXPENSE_REPORT);
  const [matchedEmployee, setMatchedEmployee] = useState(null);
  const [expenseLoading, setExpenseLoading] = useState(false);
  const [expenseFetchError, setExpenseFetchError] = useState("");

  const [form, setForm] = useState({
    salarySlipNo: "",
    employeeId: "",
    employeeName: "",
    emiratesId: "",
    trade: "",
    rateHr: 0,
    totalPresent: 0,
    totalHoursWorked: 0,
payMonth:
  MONTHS[new Date().getMonth()],

invoiceDate:
  dayjs().format("DD/MM/YYYY"),
    additionalAllowances: 0,
  });

  // Owner company profile used to populate header (name/phone/logo). This
  // page only ever reads name/phone/logo - never stamp/signature/
  // invoiceTemplate - so it uses the lightweight metadata-only variant
  // (see useOwnerCompany.js) instead of the ~1.44MB full-asset shape
  // CompanyProfile.jsx genuinely needs, and fetches just the logo bytes
  // on demand via the new asset endpoint (only when hasLogo is true, so a
  // company with no logo yet never fires the request).
  const { data: ownerCompanyData } = useOwnerCompany();
  const { data: ownerLogoDataUri } = useOwnerCompanyAsset('logo', Boolean(ownerCompanyData?.hasLogo));
  const ownerCompany = {
    name: ownerCompanyData?.companyLegalName || ownerCompanyData?.name || "",
    phone: ownerCompanyData?.telephoneNumber || ownerCompanyData?.mobileNumber || "",
    logo: ownerLogoDataUri || null,
  };

  const [deductions, setDeductions] = useState([]);
  const [nextDeductionId, setNextDeductionId] = useState(1);

  // Reconstructs the editable deduction rows from a slip's frozen
  // slipData.deductionRows (a {label, value} summary) back into the
  // {type, amount, note} shape the Add Deduction table edits. This loses
  // per-entry granularity that existed before the slip was generated (all
  // "Other" entries were already summed into one row) - that's an accepted
  // trade-off of editing a slip's totals rather than its original entries.
  const DEDUCTION_LABEL_TO_TYPE = {
    "Penalty Amount": "Penalty Amount",
    "Gas Deduction": "Gas",
    "Other ( For Food )": "Other (Food)",
    "Other ( For Travel )": "Other (Travel)",
    "Other Deduction": "Other",
    "Advance Deduction": "Advance Deduction",
    "Advance Given": "Advance",
  };

  const { data: existingSlip, error: editLoadQueryError, isLoading: editSlipQueryLoading } = useSalarySlipForEdit(editId, { enabled: isEditMode });

  useEffect(() => {
    if (!isEditMode) return;
    setEditLoading(editSlipQueryLoading);

    if (editLoadQueryError) {
      setEditLoadError(
        editLoadQueryError?.response?.data?.message || "Failed to load this salary slip for editing."
      );
      return;
    }
    if (!existingSlip) return;

    const slip = existingSlip;
    const data = slip.slipData || {};
    const employee = data.employee || {};

    setForm((prev) => ({
      ...prev,
      salarySlipNo: String(slip.slipNumber ?? prev.salarySlipNo),
      employeeId: String(slip.employee?._id || slip.employee || ""),
      employeeName: employee.name || "",
      emiratesId: employee.emiratesId || "",
      trade: employee.trade || "",
      totalPresent: employee.totalDaysWorked || 0,
      totalHoursWorked: employee.totalHoursWorked || 0,
      // rateHr isn't stored on the slip itself - back it out from the
      // frozen calculatedSalary/hours so "Calculated Salary" still
      // matches what the original slip showed.
      rateHr: employee.totalHoursWorked
        ? Number(data.earnings?.calculatedSalary || 0) / Number(employee.totalHoursWorked || 1)
        : prev.rateHr,
      payMonth: slip.month || data.payMonth || prev.payMonth,
      invoiceDate: data.invoiceDate || prev.invoiceDate,
      additionalAllowances: Number(data.earnings?.additionalAllowances || 0),
    }));

    const reconstructedDeductions = Array.isArray(data.deductionRows)
      ? data.deductionRows
          .filter((row) => Number(row.value) > 0)
          .map((row, index) => ({
            id: index + 1,
            type: DEDUCTION_LABEL_TO_TYPE[row.label] || row.label,
            amount: Number(row.value),
            note: "",
          }))
      : [];
    setDeductions(reconstructedDeductions);
    // Any row added afterward via "Add Deduction" must continue past
    // the reconstructed ids above, or a new row could collide with a
    // reconstructed one and edits would target both at once - exactly
    // the bug this whole fix addresses.
    setNextDeductionId(reconstructedDeductions.length + 1);

    if (data.advance) {
      setExpenseReport((prev) => ({
        ...prev,
        totalAdvanceGiven: Number(data.advance.totalGiven || 0),
        remainAmount: Math.max(0, Number(data.advance.remaining || 0) + Number(data.advance.thisMonthDeduction || 0)),
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingSlip, editLoadQueryError, editSlipQueryLoading, isEditMode]);


  const calculatedSalary = Number(form.rateHr || 0) * Number(form.totalHoursWorked || 0);
  // "Advance" (Add Advance - a brand new advance given right now) is
  // deliberately excluded from deductions here: it's recorded as an
  // expense/advance addition for this employee (see Expense History), not
  // a deduction from THIS slip's pay - it doesn't reduce Total Deduction
  // Amount. Only Add Deduction's rows (including "Advance Deduction",
  // which repays an existing advance) count as this slip's deductions.
  const totalDeductions = deductions
    .filter((d) => d.type !== "Advance")
    .reduce((sum, d) => sum + Number(d.amount || 0), 0);
  // But it DOES land in the employee's hand this pay run - they're
  // physically getting that advance now, on top of whatever their
  // calculated pay works out to after deductions - so it's added back in
  // for Total Amount to Pay specifically (e.g. 2000 net after deductions +
  // 500 advance given = 2500 handed over).
  const advanceGivenThisRun = deductions
    .filter((d) => d.type === "Advance")
    .reduce((sum, d) => sum + Number(d.amount || 0), 0);
  const totalAmountToPay =
    calculatedSalary + Number(form.additionalAllowances || 0) - totalDeductions + advanceGivenThisRun;

  // Sums every deduction row of a given type — shared by the summary card
  // and the printable slip below.
  const sumByType = (type) =>
    deductions
      .filter((d) => d.type === type)
      .reduce((sum, d) => sum + Number(d.amount || 0), 0);

  // Drives the "Total Deduction Amount (AED)" card: each row reflects
  // exactly what's been added in Add Deduction, defaulting to 0 when that
  // type hasn't been used yet. "Other" combines both Food and Travel since
  // the summary card only has a single generic "Other" line. "Advance"
  // here is ONLY the Add Deduction repayment ("Advance Deduction") - the
  // Add Advance new-advance amount is a separate expense entry (see
  // Expense History) and deliberately never appears in this card.
  const deductionBreakdown = {
    penalty: sumByType("Penalty Amount"),
    gas: sumByType("Gas"),
    advance: sumByType("Advance Deduction"),
    other: sumByType("Other (Food)") + sumByType("Other (Travel)") + sumByType("Other"),
  };

  // "View Report" should appear the moment a deduction row exists (i.e. as
  // soon as "Add" is clicked) - it doesn't need to wait for that row's type
  // and amount to actually be filled in, since the report itself is about
  // this employee's existing expense/deduction history, not the in-progress
  // row.
  const hasDeductions = deductions.length > 0;

  // Only one running balance of each - one "Advance Deduction" row (repaying
  // an existing advance) and, separately, one "Advance" row (giving a new
  // one) at a time.
  const advanceDeductionAlreadyUsed = deductions.some((d) => d.type === "Advance Deduction");
  const advanceAlreadyUsed = deductions.some((d) => d.type === "Advance");

  const grossPayForThisSlip = calculatedSalary + Number(form.additionalAllowances || 0);

  // "Advance Deduction" is repaying an advance the employee was already
  // given, so - unlike every other deduction type, which behaves like a
  // penalty - it can never deduct more than what's actually still
  // outstanding. "Advance" (Add Advance / a brand new advance) has no such
  // cap - it's new money being given, not capped by what's already owed.
  const advanceDeductionAmount = sumByType("Advance Deduction");

  let balanceValidationError = "";
  if (totalDeductions > grossPayForThisSlip) {
    balanceValidationError = "Deduction amount cannot exceed the remaining available balance.";
  } else if (advanceDeductionAmount > expenseReport.remainAmount) {
    balanceValidationError = "Advance deduction cannot exceed the remaining advance balance.";
  }

  const handleFormChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };


  // Same params as Employees.jsx's own useEmployees - genuine cache
  // sharing, not just a parallel fetch.
  const { data: employees = [] } = useEmployees();

  // Was useAllSalarySlips() - fetched this owner's ENTIRE slip history
  // (populate('employee') on every row) just to compute
  // Math.max(...slipNumbers) in JS. Measured at ~2.5s browser-observed on
  // a tenant with a large slip history. /generate-info answers the same
  // question with a single indexed lookup (see salarySlip.controller.js).
  // The duplicate-check in handleGenerate below now calls the same
  // endpoint again with the specific employeeId/month/year at submit
  // time, instead of reading this same full list a second way.
  useEffect(() => {
    let active = true;
    salarySlipsApi.getGenerateInfo().then((response) => {
      if (!active) return;
      const nextSlipNumber = response?.data?.nextSlipNumber || 1;
      setForm((prev) => ({ ...prev, salarySlipNo: String(nextSlipNumber) }));
    });
    return () => {
      active = false;
    };
  }, []);

  // Looks up the employee currently entered on the form (by Emirates ID,
  // falling back to name) and pulls their real expense ledger from the
  // Expenses API — the same data source the Expenses page itself reads
  // from. Triggered by "Add Deduction" and "View Report" only.
  const fetchExpenseReport = async () => {
    setExpenseFetchError("");

    const emiratesId = String(form.emiratesId || "").trim();
    const employeeName = String(form.employeeName || "").trim();

    if (!emiratesId && !employeeName) {
      setExpenseFetchError("Enter Employee Name or Emirates ID first.");
      return null;
    }

    setExpenseLoading(true);
    try {
      // Reuses the same employees list already fetched via useEmployees()
      // above instead of re-fetching the identical {page:1,limit:500}
      // list a second time - the original fetched this fresh on every
      // call, a genuine duplicate request eliminated here.
      const empList = employees;

      const employee =
        empList.find(
          (e) => emiratesId && String(e.emiratesId || e.employeeId || "").trim() === emiratesId
        ) ||
        empList.find((e) => {
          const needle = `${employeeName} ${emiratesId}`.toLowerCase().replace(/\s+/g, " ").trim();
          return needle && getEmployeeSearchValue(e).includes(needle);
        }) ||
        null;

      if (!employee?._id) {
        setMatchedEmployee(null);
        setExpenseReport(EMPTY_EXPENSE_REPORT);
        setExpenseFetchError("No matching employee found for this Name / Emirates ID.");
        return null;
      }

      setMatchedEmployee(employee);

      const expenseResponse = await expensesApi.getExpenses(employee._id);
      const payload = expenseResponse?.data?.expenses || expenseResponse?.data?.data || expenseResponse?.data;
      const records = Array.isArray(payload?.records) ? payload.records : Array.isArray(payload) ? payload : [];

      const summary = summarizeEmployeeExpenseRecords(records);
      setExpenseReport(summary);
      return summary;
    } catch (err) {
      setExpenseReport(EMPTY_EXPENSE_REPORT);
      setExpenseFetchError(err?.response?.data?.message || "Failed to load expense data for this employee.");
      return null;
    } finally {
      setExpenseLoading(false);
    }
  };

  const handleAddDeduction = async () => {
    setDeductions((prev) => [...prev, { id: nextDeductionId, type: "", amount: "" }]);
    setNextDeductionId((prev) => prev + 1);
    fetchExpenseReport();
  };

  // Dedicated "Add Advance" section, separate from the generic Deduction
  // list above. It still writes into the same `deductions` array (tagged
  // type: "Advance") so the existing buildSlipData/handleGenerate/
  // deductionEntries → Expense History sync all keep working unchanged -
  // adding an advance here shows up as an addition in that employee's
  // Expense History on the date the slip is generated, and removing it
  // here removes it from Expense History the same way (see
  // syncSalarySlipExpenseRecords on the backend, which replaces this
  // slip's mirrored records with whatever's currently in this array).
  const handleAddAdvance = async () => {
    if (advanceAlreadyUsed) return;
    setDeductions((prev) => [...prev, { id: nextDeductionId, type: "Advance", amount: "" }]);
    setNextDeductionId((prev) => prev + 1);
    fetchExpenseReport();
  };

  const handleRemoveAdvance = (id) => {
    setDeductions((prev) => prev.filter((d) => d.id !== id));
  };

  const handleViewReport = async () => {
    setShowExpenseReport(true);
    fetchExpenseReport();
  };

  const handleDeductionChange = (id, field, value) => {
    setDeductions((prev) => prev.map((d) => (d.id === id ? { ...d, [field]: value } : d)));
  };

  const handleDeleteDeduction = (id) => {
    setDeductions((prev) => prev.filter((d) => d.id !== id));
  };

  const handleBack = () => navigate("/salary-slip");

  // Assembles the data shape consumed by both SalarySlipDocument (preview
  // tab) and generateSalarySlipPdf (download), from the current form state.
  // "Total Advance Given" / "Remaining Advance" come from the live
  // expenseReport (fetched from the Expenses API for this employee),
  // exactly matching the figure on file. "Advance Deduction" is repaying
  // an existing advance (Add Deduction); "Advance Given" is a brand new
  // advance handed out via the separate Add Advance section - they move
  // the employee's balance in opposite directions.
  const buildSlipData = () => {
    const grossSalary = calculatedSalary + Number(form.additionalAllowances || 0);
    const advanceRepaymentThisMonth = sumByType("Advance Deduction");
    const advanceGivenThisMonth = sumByType("Advance");

    const deductionRows = [
      { label: "Penalty Amount", value: sumByType("Penalty Amount") },
      { label: "Gas Deduction", value: sumByType("Gas") },
      { label: "Other ( For Food )", value: sumByType("Other (Food)"), optional: true },
      { label: "Other ( For Travel )", value: sumByType("Other (Travel)") },
      { label: "Other Deduction", value: sumByType("Other"), optional: true },
      { label: "Advance Deduction", value: advanceRepaymentThisMonth },
    ].filter((row) => !row.optional || row.value > 0);

    const parsedDate = form.invoiceDate ? dayjs(form.invoiceDate, "DD/MM/YYYY") : null;
    const payYear = parsedDate && parsedDate.isValid() ? parsedDate.format("YYYY") : String(new Date().getFullYear());

    // Remaining balance per Expenses page (totalAdvance - deductions so
    // far), projected forward by what THIS slip changes: minus whatever's
    // being repaid this month, plus whatever new advance is being given.
    const remainingPerExpensesPage = expenseReport.remainAmount;

    return {
      // Use owner company profile when available
      companyName: ownerCompany.name || "Company name",
      companyPhone: ownerCompany.phone || "Company Phone no",
      companyLogo: ownerCompany.logo || null,
      payMonth: form.payMonth,
      payYear,
      // The date actually entered on this form (DD/MM/YYYY) - the source
      // of truth for what the salary slip list table displays, since
      // createdAt (when the DB record was written) is not the same thing
      // and shouldn't be shown as if it were.
      invoiceDate: form.invoiceDate,
      employee: {
        name: form.employeeName,
        emiratesId: form.emiratesId,
        trade: form.trade,
        totalDaysWorked: form.totalPresent,
        totalHoursWorked: form.totalHoursWorked,
      },
      earnings: {
        calculatedSalary,
        additionalAllowances: Number(form.additionalAllowances || 0),
        grossSalary,
      },
      deductionRows,
      totalDeduction: totalDeductions,
      advance: {
        totalGiven: expenseReport.totalAdvanceGiven,
        thisMonthDeduction: advanceRepaymentThisMonth,
        thisMonthGiven: advanceGivenThisMonth,
        remaining: remainingPerExpensesPage - advanceRepaymentThisMonth + advanceGivenThisMonth,
      },
      netSalary: grossSalary - totalDeductions + advanceGivenThisMonth,
    };
  };

  // Maps the two advance-related deduction type labels to the normalised
  // expense type strings used by Expenses.jsx / normalizeExpenseType().
  // Only "Advance Deduction" and "Advance" ever reach this map - see the
  // activeDeductions filter above, which excludes every other deduction
  // type from Expense History entirely (Penalty/Gas/Other Food/Other
  // Travel/Other only ever affect this slip's own net pay).
  // "Advance Deduction" (repaying an existing advance) maps to the
  // DEDUCTION_TYPES-recognised "advance deduction" string, so it reduces
  // the running balance on the Expenses page / mobile View Advance.
  // "Advance" (a brand new advance given right now) maps to the plain
  // "advance" ADDITION type instead - it still gets subtracted from this
  // slip's net pay above (money handed out now instead of paid through
  // payroll), but in Expense History it shows up as an addition
  // (increasing what the employee owes back), not a deduction.
  const SLIP_TO_EXPENSE_TYPE = {
    "Advance Deduction": "advance deduction", // → DEDUCTION_TYPES (repaying an existing advance)
    "Advance":           "advance",           // → ADDITION type (a new advance given now)
  };

  const saveSalarySlipMutation = useSaveSalarySlipMutation();

  const handleGenerate = async () => {
    if (generateGuardRef.current) return;
    generateGuardRef.current = true;
    setIsGenerating(true);
    setSlipError("");

    if (balanceValidationError) {
      setSlipError(balanceValidationError);
      generateGuardRef.current = false;
      setIsGenerating(false);
      return;
    }

    // Deduction entries are sent to the backend as part of the slip
    // payload below (deductionEntries) - it reconciles Expense History
    // from there (see expenseHistorySync.service.js) for both create AND
    // edit, rather than the frontend making separate addExpense calls.
    // That's what makes editing a slip's deductions safe to redo any
    // number of times without duplicating history: the backend always
    // replaces this slip's mirrored records with exactly what's sent here.
    //
    // Only "Advance Deduction" (repaying an existing advance) and "Advance"
    // (a brand new advance given now) are sent here - they're the only two
    // types that actually belong in that employee's advance ledger.
    // Penalty/Gas/Other Food/Other Travel/Other still reduce this slip's
    // net pay (see totalDeductions above), but they're ordinary
    // deductions unrelated to advances, so they must never create an
    // Expense History entry or touch the advance balance.
    const activeDeductions = deductions.filter(
      (d) =>
        (d.type === "Advance Deduction" || d.type === "Advance") &&
        Number(d.amount) > 0
    );

    const parsedInvoiceDate = form.invoiceDate ? dayjs(form.invoiceDate, "DD/MM/YYYY") : dayjs();
    const slipLabel = `${form.payMonth} ${parsedInvoiceDate.isValid() ? parsedInvoiceDate.format("YYYY") : dayjs().format("YYYY")} Salary Slip`;

    const deductionEntries = activeDeductions.map((d) => {
      const expenseType = SLIP_TO_EXPENSE_TYPE[d.type] || String(d.type).toLowerCase();
      // Advance gets its own explicit note so it reads as an addition in
      // Expense History ("Advance amount added"), not as a generic
      // deduction line like the other types below.
      const note =
        d.type === "Advance"
          ? `Advance amount added - ${slipLabel}`
          : `${d.type} - ${slipLabel}`;
      return {
        type: expenseType,
        amount: Number(d.amount),
        note,
      };
    });

    // Freeze the exact data the slip was generated with, so Preview and
    // Download always reflect what was actually generated.
    try {
      const frozenSlipData = buildSlipData();
      // Reuse the SAME year buildSlipData already derived from the actual
      // selected pay date - previously this was hardcoded to
      // new Date().getFullYear(), so a slip dated for a past/future year
      // would be tagged with today's year on the top-level `year` field
      // (used for duplicate detection & listing) while slipData.payYear
      // (used for display/PDF) showed the correct one - two different
      // years on the same slip.
      const payYear = Number(frozenSlipData.payYear);

      if (!isEditMode) {
        // Frontend duplicate check - the backend also enforces this (409 +
        // a unique index), but catching it here means the user sees the
        // message before waiting on a request, and is pointed at editing
        // the existing slip instead of trying again. A fresh, targeted
        // lookup for this exact employee/month/year (not the whole slip
        // history) right before the write - same "freshest possible read"
        // reasoning already applied to InvoicePreviewWindow.jsx's save
        // mutation, without re-fetching every slip to get it.
        try {
          const response = await salarySlipsApi.getGenerateInfo(form.employeeId, form.payMonth, payYear);
          if (response?.data?.duplicateExists) {
            setSlipError(
              `A salary slip for ${form.employeeName || "this employee"} - ${form.payMonth} ${payYear} already exists. Use Edit on the existing slip instead.`
            );
            return;
          }
        } catch (err) {
          // If this pre-check itself fails (network blip), fall through -
          // the backend's own duplicate check still protects us.
        }
      }

      const slipPayload = {
        employeeId: form.employeeId,
        payMonth: form.payMonth,
        payYear,
        grossSalary: calculatedSalary + Number(form.additionalAllowances || 0),
        additionalAllowances: Number(form.additionalAllowances || 0),
        totalDeduction: totalDeductions,
        netSalary: totalAmountToPay,
        slipData: frozenSlipData,
        deductionEntries,
      };

      const response = await saveSalarySlipMutation.mutateAsync({ isEditMode, editId, payload: slipPayload });

      setGeneratedSlipData(frozenSlipData);

      // update slip number immediately (create mode only - editing doesn't
      // consume a new sequential number)
      if (!isEditMode && response?.data?.salarySlip?.slipNumber) {
        setForm((prev) => ({
          ...prev,
          salarySlipNo: String(Number(response.data.salarySlip.slipNumber) + 1),
        }));
      }

      setShowSuccessModal(true);
    } catch (err) {
      setSlipError(
        err?.response?.data?.message ||
          (isEditMode ? "Failed to update salary slip" : "Failed to save salary slip")
      );
    } finally {
      generateGuardRef.current = false;
      setIsGenerating(false);
    }
  };

  // Redirects back to the salary slip listing page. Used after the success
  // modal is closed or a download is triggered — i.e. once the user is done
  // with this generated slip.
  const goToSalarySlipList = () => navigate("/salary-slip");

  const handlePreviewSlip = () => {
    const dataToPreview = generatedSlipData || buildSlipData();
    const previewWindow = window.open("", "_blank");
    if (!previewWindow) {
      setSlipError("Popup blocked. Please allow popups for this site and try again.");
      return;
    }
    previewWindow.document.open();
    previewWindow.document.write(buildSlipPreviewHtml(dataToPreview));
    previewWindow.document.close();
    // Preview does not close the modal or navigate away — the user may
    // still want to download from the same modal afterward.
  };

  const handleDownloadPDF = async () => {
    const dataToDownload = generatedSlipData || buildSlipData();
    try {
      const blob = await generateSalarySlipPdf(dataToDownload);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeName = (form.employeeName || "salary-slip").trim().replace(/\s+/g, "_");
      a.download = `${safeName}_Salary_Slip_${form.payMonth}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setShowSuccessModal(false);
      goToSalarySlipList();
    } catch (err) {
      setSlipError(err?.message || 'Failed to generate PDF');
    }
  };

  const handleCloseSuccessModal = () => {
    setShowSuccessModal(false);
    goToSalarySlipList();
  };

  return (
    <div style={{ padding: "24px", background: SURFACE_SECONDARY, minHeight: "100vh", boxSizing: "border-box", fontFamily: "sans-serif" }}>
      <div
        style={{
          background: "#fff",
          border: `1px solid ${BORDER}`,
          borderRadius: "12px",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* CONTENT */}
        <div style={{ padding: "32px 40px 24px" }}>
          <button
            onClick={handleBack}
            style={backButtonStyle}
            onMouseEnter={(e) => (e.currentTarget.style.background = LIGHT)}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
          >
            <ChevronLeftIcon sx={{ fontSize: 16 }} />
            Back
          </button>

          <FormHeading
            title={isEditMode ? "Edit Salary Slip" : "Generate Salary slip"}
            subtitle={isEditMode ? "Update this employee's salary slip." : "Enter invoice information."}
          />

          {isEditMode && editLoading && (
            <div style={{ marginBottom: "20px", fontSize: "13px", color: "#6B7280" }}>
              Loading salary slip...
            </div>
          )}

          {editLoadError && (
            <div
              style={{
                marginBottom: "20px",
                padding: "10px 14px",
                borderRadius: "8px",
                background: "#FEF2F2",
                border: "1px solid #FCA5A5",
                color: "#B91C1C",
                fontSize: "13px",
              }}
            >
              {editLoadError}
            </div>
          )}

          {slipError && (
            <div
              style={{
                marginBottom: "20px",
                padding: "10px 14px",
                borderRadius: "8px",
                background: "#FEF2F2",
                border: "1px solid #FCA5A5",
                color: "#B91C1C",
                fontSize: "13px",
              }}
            >
              {slipError}
            </div>
          )}

          {expenseFetchError && (
            <div
              style={{
                marginBottom: "20px",
                padding: "10px 14px",
                borderRadius: "8px",
                background: "#FFFBEB",
                border: "1px solid #FDE68A",
                color: "#92400E",
                fontSize: "13px",
              }}
            >
              {expenseFetchError}
            </div>
          )}

          <div style={{ display: "flex", gap: "32px", alignItems: "flex-start" }}>
            {/* LEFT COLUMN - FORM */}
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "18px" }}>
              
              <Field label="Employee Name" required>
                <SearchableSelect
                  options={employees.map((emp) => ({
                    value: emp._id || emp.id,
                    label: emp.name || `${emp.firstName || ""} ${emp.lastName || ""}`.trim(),
                  }))}
                  value={form.employeeId || ""}
                  placeholder="Select or type to search"
                  onChange={async (id) => {
                    setForm((p) => ({ ...p, employeeId: id }));
                    if (!id) return;
                    try {
                      const resp = await employeesApi.getEmployee(id);
const emp =
  resp?.data?.data ||
  resp?.data?.employee ||
  resp?.data ||
  {};                      // Debug log to help trace why fields may not populate
                      console.debug('GenerateSalarySlip: selected employee fetched', id, emp);
                      const fullName = emp.name || `${emp.firstName||''} ${emp.lastName||''}`.trim();
                      // populate basic fields
                      setForm((p) => ({
                        ...p,
                        employeeId: id,
                        employeeName: fullName,
                        emiratesId: emp.emiratesId || emp.employeeId || p.emiratesId,
                        trade: emp.trade || emp.position || p.trade,
                        rateHr: emp.ratePerHour || emp.rateHr || emp.hourlyRate || emp.rate || p.rateHr,
                      }));
                      setMatchedEmployee(emp);

                      // fetch expense report for this employee
                      try {
                        const expenseResponse = await expensesApi.getExpenses(id);
                        const payload = expenseResponse?.data?.expenses || expenseResponse?.data?.data || expenseResponse?.data;
                        const records = Array.isArray(payload?.records) ? payload.records : Array.isArray(payload) ? payload : [];
                        const summary = summarizeEmployeeExpenseRecords(records);
                        setExpenseReport(summary);
                        setExpenseFetchError("");
                      } catch (err) {
                        setExpenseReport(EMPTY_EXPENSE_REPORT);
                      }

                      // fetch attendance and compute totals
                      try {
                        const attResp = await employeesApi.getEmployeeAttendance(id);
                        const items = Array.isArray(attResp?.data?.data) ? attResp.data.data : Array.isArray(attResp?.data) ? attResp.data : [];
                        // let totalDays = 0;
                        // let totalHours = 0;
                        // items.forEach((it) => {
                        //   const status = String(it.status || '').toLowerCase();
                        //   if (status === 'present') totalDays += 1;
                        //   else if (status === 'half-day' || status === 'half') totalDays += 0.5;
                        //   if (typeof it.hoursWorked === 'number') totalHours += Number(it.hoursWorked || 0);
                        // });
                        const now = new Date();

const currentMonthItems =
  items.filter((row) => {
    const d = new Date(row.date);

    return (
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear()
    );
  });

let totalDays = 0;
let totalHours = 0;

currentMonthItems.forEach((it) => {
  const status =
    String(it.status || "")
      .toLowerCase();

  if (status === "present")
    totalDays += 1;

  else if (
    status === "half-day" ||
    status === "half"
  )
    totalDays += 0.5;

  totalHours += Number(
    it.hoursWorked || 0
  );
});
                        
                        setForm((p) => ({ ...p, totalPresent: totalDays, totalHoursWorked: Math.round(totalHours * 100) / 100 }));
                      } catch (err) {
                        // ignore attendance failures
                      }
                    } catch (err) {
                      console.error('GenerateSalarySlip: failed to load employee', id, err);
                    }
                  }}
                />
              </Field>
              
              <Field label="Emirates ID" required>
                
                <FInput
                  type="text"
                  value={form.emiratesId}
                  onChange={(e) => handleFormChange("emiratesId", e.target.value)}
                  placeholder="Enter Emirates ID"
                />
              </Field>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <Field label="Trade" required>
                  <FInput
                    type="text"
                    value={form.trade}
                    onChange={(e) => handleFormChange("trade", e.target.value)}
                    placeholder="Enter trade"
                  />
                </Field>
                <Field label="Rate / hr" required>
                  <UnitInput
                    prefix="AED"
                    type="number"
                    placeholder="0"
                    value={form.rateHr}
                    onChange={(e) => handleFormChange("rateHr", e.target.value === "" ? "" : parseFloat(e.target.value))}
                  />
                </Field>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <Field label="Total Present" required>
                  <UnitInput
                    suffix="Days"
                    type="number"
                    placeholder="0"
                    value={form.totalPresent}
                    onChange={(e) => handleFormChange("totalPresent", e.target.value === "" ? "" : parseInt(e.target.value))}
                  />
                </Field>
                <Field label="Total Hour Worked" required>
                  <UnitInput
                    suffix="Hr"
                    type="number"
                    step="0.01"
                    placeholder="0"
                    value={form.totalHoursWorked}
                    onChange={(e) => handleFormChange("totalHoursWorked", e.target.value === "" ? "" : parseFloat(e.target.value))}
                  />
                </Field>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <Field label="Pay Month" required>
                  <FSelect value={form.payMonth} onChange={(e) => handleFormChange("payMonth", e.target.value)}>
                    <option value="" disabled>Select month</option>
                    {MONTHS.map((month) => (
                      <option key={month} value={month}>{month}</option>
                    ))}
                  </FSelect>
                </Field>
                <Field label="Invoice Date" required>
                  <LocalizationProvider dateAdapter={AdapterDayjs}>
                    <DatePicker
                      format="DD/MM/YYYY"
                      value={form.invoiceDate ? dayjs(form.invoiceDate, "DD/MM/YYYY") : null}
                      onChange={(newValue) =>
                        handleFormChange("invoiceDate", newValue ? newValue.format("DD/MM/YYYY") : "")
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
                      }}
                    />
                  </LocalizationProvider>
                </Field>
              </div>

              <Field label="Additional Allowances Amount">
                <UnitInput
                  prefix="AED"
                  type="number"
                  placeholder="0"
                  value={form.additionalAllowances}
                  onChange={(e) => handleFormChange("additionalAllowances", e.target.value === "" ? "" : parseFloat(e.target.value))}
                />
              </Field>

              {/* ADD ADVANCE - separate from the deduction list below: its
                  own Add button, for handing the employee a brand NEW
                  advance right now (not capped by their remaining balance -
                  that's what "Advance Deduction" in Add Deduction is for,
                  repaying an existing one). Adding one here is mirrored
                  into Expense History as an ADDITION dated the day the slip
                  is generated ("Advance amount added"); removing it here
                  removes it from Expense History too - both handled
                  server-side by syncSalarySlipExpenseRecords via
                  deductionEntries. */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                  <span style={{ fontSize: "14px", fontWeight: 600, color: DARK }}>Add Advance</span>
                  <OutlineBtn
                    onClick={handleAddAdvance}
                    icon={<AddIcon sx={{ fontSize: 16 }} />}
                    disabled={expenseLoading || advanceAlreadyUsed}
                  >
                    Add
                  </OutlineBtn>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  {deductions.filter((d) => d.type === "Advance").map((deduction) => (
                    <div key={deduction.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: "16px", alignItems: "end" }}>
                      <Field label="Advance">
                        <div style={{ ...baseInput, display: "flex", alignItems: "center", gap: "6px" }}>
                          <span style={{ fontSize: "14px", color: DARK }}>Advance</span>
                        </div>
                      </Field>
                      <Field label="Advance Amount">
                        <UnitInput
                          prefix="AED"
                          type="number"
                          placeholder="0"
                          value={deduction.amount}
                          onChange={(e) =>
                            handleDeductionChange(
                              deduction.id,
                              "amount",
                              e.target.value === "" ? "" : parseFloat(e.target.value)
                            )
                          }
                        />
                      </Field>
                      <button
                        type="button"
                        onClick={() => handleRemoveAdvance(deduction.id)}
                        aria-label="Remove this advance"
                        title="Remove this advance"
                        style={{
                          height: "40px",
                          padding: "0 14px",
                          border: "1px solid #FCA5A5",
                          borderRadius: "8px",
                          background: "#FEF2F2",
                          color: "#DC2626",
                          fontSize: "13px",
                          fontWeight: 500,
                          cursor: "pointer",
                          fontFamily: "inherit",
                          whiteSpace: "nowrap",
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* ADD DEDUCTION */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                  <span style={{ fontSize: "14px", fontWeight: 600, color: DARK }}>Add Deduction</span>
                  <div style={{ display: "flex", gap: "8px" }}>
                    {hasDeductions && (
                      <OutlineBtn onClick={handleViewReport} disabled={expenseLoading}>
                        {expenseLoading ? "Loading…" : "View Report"}
                      </OutlineBtn>
                    )}
                    <OutlineBtn onClick={handleAddDeduction} icon={<AddIcon sx={{ fontSize: 16 }} />} disabled={expenseLoading}>
                      Add
                    </OutlineBtn>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  {deductions.filter((d) => d.type !== "Advance").map((deduction) => {
                    const availableTypes = DEDUCTION_TYPES.filter(
                      (type) => type !== "Advance Deduction" || deduction.type === "Advance Deduction" || !advanceDeductionAlreadyUsed
                    );
                    return (
                      <div key={deduction.id} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: "16px", alignItems: "end" }}>
                          <Field label="Deduction Type">
                            {deduction.type === "Advance Deduction" ? (
                              <div
                                onClick={() => handleDeductionChange(deduction.id, "type", "")}
                                style={{
                                  ...baseInput,
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "6px",
                                  cursor: "pointer",
                                }}
                              >
                                <span style={{ fontSize: "14px", color: DARK }}>Advance Deduction</span>
                                <span style={{ fontSize: "12px", fontStyle: "italic", color: GRAY }}>
                                  (Total advance {expenseReport.remainAmount.toFixed(2)} remain)
                                </span>
                              </div>
                            ) : (
                              <FSelect
                                value={deduction.type}
                                onChange={(e) => handleDeductionChange(deduction.id, "type", e.target.value)}
                              >
                                <option value="" disabled>Select type</option>
                                {availableTypes.map((type) => (
                                  <option key={type} value={type}>{type}</option>
                                ))}
                              </FSelect>
                            )}
                          </Field>
                          <Field label="Deduction Amount">
                            <UnitInput
                              prefix="AED"
                              type="number"
                              placeholder="0"
                              value={deduction.amount}
                              onChange={(e) =>
                                handleDeductionChange(
                                  deduction.id,
                                  "amount",
                                  e.target.value === "" ? "" : parseFloat(e.target.value)
                                )
                              }
                            />
                          </Field>
                          <button
                            type="button"
                            onClick={() => handleDeleteDeduction(deduction.id)}
                            aria-label="Remove this deduction"
                            title="Remove this deduction"
                            style={{
                              height: "40px",
                              padding: "0 14px",
                              border: "1px solid #FCA5A5",
                              borderRadius: "8px",
                              background: "#FEF2F2",
                              color: "#DC2626",
                              fontSize: "13px",
                              fontWeight: 500,
                              cursor: "pointer",
                              fontFamily: "inherit",
                              whiteSpace: "nowrap",
                            }}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {balanceValidationError && (
                  <div
                    style={{
                      marginTop: "12px",
                      padding: "10px 14px",
                      borderRadius: "8px",
                      background: "#FEF2F2",
                      border: "1px solid #FCA5A5",
                      color: "#B91C1C",
                      fontSize: "13px",
                    }}
                  >
                    {balanceValidationError}
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT COLUMN - SUMMARY / EXPENSE REPORT */}
            <div style={{ width: "380px", flexShrink: 0, position: "sticky", top: "24px" }}>
              {!showExpenseReport ? (
                <>
                  <InfoCard label="Salary Slip No." value={form.salarySlipNo} />
                  <InfoCard
                    label="Calculated Salary (Rate x Hour)"
                    value={calculatedSalary.toFixed(2)}
                    suffix="/ AED"
                  />
                  <InfoCard
                    label="Additional Allowances Amount"
                    value={Number(form.additionalAllowances || 0).toFixed(2)}
                    suffix="/ AED"
                  />
                  <InfoCard
                    label="Advance Paid"
                    value={sumByType("Advance").toFixed(2)}
                    suffix="/ AED"
                  />
                  <InfoCard label="Total Deduction Amount (AED)" value={totalDeductions.toFixed(2)} suffix="/ AED">
                    <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>
                      {[
                        { label: "Penalty Amount", value: deductionBreakdown.penalty },
                        { label: "Gas", value: deductionBreakdown.gas },
                        { label: "Advance", value: deductionBreakdown.advance },
                        { label: "Other", value: deductionBreakdown.other },
                      ].map((row) => (
                        <div key={row.label} style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ fontSize: "13px", color: GRAY }}>{row.label}</span>
                          <span style={{ fontSize: "13px", color: DARK, fontWeight: 500 }}>
                            {row.value.toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </InfoCard>
                  <InfoCard label="Total Amount to Pay" value={totalAmountToPay.toFixed(2)} suffix="/ AED" />
                </>
              ) : (
                <div
                  style={{
                    background: SURFACE_SECONDARY,
                    border: `1px solid ${BORDER}`,
                    borderRadius: "8px",
                    padding: "20px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                    <span style={{ fontSize: "16px", fontWeight: 600, color: DARK }}>Expense Report</span>
                    <button
                      onClick={() => setShowExpenseReport(false)}
                      style={{
                        width: "28px",
                        height: "28px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        border: "none",
                        background: "transparent",
                        borderRadius: "50%",
                        cursor: "pointer",
                        color: GRAY,
                      }}
                    >
                      <CloseIcon sx={{ fontSize: 18 }} />
                    </button>
                  </div>

                  {expenseLoading ? (
                    <p style={{ fontSize: "13px", color: GRAY, textAlign: "center", padding: "20px 0" }}>
                      Loading expense data…
                    </p>
                  ) : (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "12px" }}>
                        <span style={{ fontSize: "13px", color: GRAY }}>Total Expense Amount</span>
                        <span style={{ fontSize: "16px", fontWeight: 700, color: DARK }}>
                          AED {expenseReport.totalExpense.toFixed(2)}
                        </span>
                      </div>

                      {[
                        { label: "Gas", value: expenseReport.gas },
                        { label: "Advance", value: expenseReport.advance },
                        { label: "Other (Food)", value: expenseReport.otherFood },
                        { label: "Other (Travel)", value: expenseReport.otherTravel },
                      ].map((row) => (
                        <div key={row.label} style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                          <span style={{ fontSize: "13px", color: GRAY }}>{row.label}</span>
                          <span style={{ fontSize: "13px", fontWeight: 600, color: DARK }}>
                            <span style={{ color: GRAY, fontWeight: 400, marginRight: "4px" }}>AED</span>
                            {row.value.toFixed(2)}
                          </span>
                        </div>
                      ))}

                      <div style={{ height: "1px", background: BORDER, margin: "16px 0" }} />

                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "20px" }}>
                        <span style={{ fontSize: "13px", color: GRAY }}>Remain Amount</span>
                        <span style={{ fontSize: "16px", fontWeight: 700, color: DARK }}>
                          AED {expenseReport.remainAmount.toFixed(2)}
                        </span>
                      </div>

                      {expenseReport.history.length === 0 ? (
                        <p style={{ fontSize: "13px", color: GRAY, textAlign: "center", padding: "12px 0" }}>
                          No expense history yet.
                        </p>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                          {expenseReport.history.map((item, idx) => {
                            const isDeductionEntry = item.type === "deduction";
                            const flowColor = isDeductionEntry ? DEDUCTION_COLOR : ADDITION_COLOR;
                            return (
                            <div
                              key={idx}
                              style={{
                                border: `1px solid ${BORDER}`,
                                borderRadius: "10px",
                                padding: "12px",
                                display: "flex",
                                alignItems: "flex-start",
                                justifyContent: "space-between",
                                background: "#fff",
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                                <MoneyFlowIcon direction={isDeductionEntry ? "out" : "in"} />
                                <div>
                                  <p style={{ fontSize: "13px", fontWeight: 600, color: flowColor, margin: 0 }}>
                                    {item.label}
                                  </p>
                                  <p style={{ fontSize: "13px", fontWeight: 600, color: flowColor, margin: 0 }}>
                                    AED {item.amount.toFixed(2)}
                                  </p>
                                </div>
                              </div>
                              <span style={{ fontSize: "12px", color: GRAY, whiteSpace: "nowrap" }}>{item.date}</span>
                            </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
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
          <CancelBtn onClick={handleBack} />
          <PrimaryBtn onClick={handleGenerate} disabled={Boolean(balanceValidationError) || isGenerating}>{isGenerating ? "Saving..." : isEditMode ? "Update" : "Generate"}</PrimaryBtn>
        </div>
      </div>
      {showSuccessModal && (
        <SuccessDialog
          employeeName={form.employeeName}
          onPreview={handlePreviewSlip}
          onDownload={handleDownloadPDF}
          onClose={handleCloseSuccessModal}
        />
      )}
    </div>
  );
}