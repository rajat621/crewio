import NorthEastIcon from "@mui/icons-material/NorthEast";
import SouthWestIcon from "@mui/icons-material/SouthWest";

const BORDER = "var(--border-card)";
const DARK   = "var(--text-primary)";
const GRAY   = "var(--text-secondary)";
const BLUE   = "var(--color-primary)";

// ─── helpers ────────────────────────────────────────────────────────────────

function getInitialsAndColor(name = "") {
  const words = name.trim().split(/\s+/);
  const initials = words.length >= 2
    ? (words[0][0] + words[1][0]).toUpperCase()
    : (words[0]?.[0] ?? "?").toUpperCase();
  const COLORS = ["#7C6FF7","#3B82F6","#10B981","#F59E0B","#EF4444","#8B5CF6","#EC4899","#14B8A6"];
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffff;
  return { initials, bg: COLORS[hash % COLORS.length] };
}

// Types that reduce the employee's remaining balance (shown with out-arrow icon).
const DEDUCTION_TYPES_SET = new Set([
  "deduction", "advance deduction", "penalty", "penalty amount", "fine",
]);

function isDeductionType(type = "") {
  return DEDUCTION_TYPES_SET.has(String(type).toLowerCase().trim());
}

function MoneyFlowIcon({ direction }) {
  const Arrow = direction === "out" ? NorthEastIcon : SouthWestIcon;
  return (
    <div style={{
      width: 28, height: 28, borderRadius: "50%",
      border: `1px solid ${BORDER}`, background: "#fff",
      display: "flex", alignItems: "center", justifyContent: "center",
      position: "relative", flexShrink: 0,
    }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: GRAY }}>$</span>
      <Arrow sx={{
        fontSize: 11, position: "absolute",
        top:    direction === "out" ? -4 : "auto",
        bottom: direction === "in"  ? -4 : "auto",
        right:  direction === "out" ? -4 : "auto",
        left:   direction === "in"  ? -4 : "auto",
        color: GRAY, background: "#fff", borderRadius: "50%",
      }} />
    </div>
  );
}

// ─── dynamic breakdown builder ───────────────────────────────────────────────
//
// Maps the normalised expense type keys produced by Expenses.jsx to the
// human-readable labels shown in the card. Only categories that have a
// non-zero total are included.
//
// "other" entries are special: instead of collapsing them into one "Other"
// row, we expand them using each history entry's label (the custom description
// the user typed). So if someone added Gas and "Other (Tools)", the card shows:
//   Gas         AED 250
//   Other (Tools) AED 150
// — nothing else.

const TYPE_LABEL_MAP = {
  gas:            "Gas",
  advance:        "Advance",
  "other food":   "Other (Food)",
  "other travel": "Other (Travel)",
};

function buildDisplayRows(breakdown = {}, history = []) {
  const items = [];

  for (const [type, amount] of Object.entries(breakdown)) {
    if (!amount || amount <= 0) continue;

    // Deductions reduce the remaining balance — they live in payment history
    // but don't count as positive expense categories in the breakdown.
    if (isDeductionType(type)) continue;

    if (type === "other") {
      // Expand into individual custom-labelled sub-entries so the user sees
      // exactly what they typed (e.g. "Other (Tools)", "Other (Uniform)").
      const otherEntries = history.filter(
        (h) => String(h.type || "").toLowerCase().trim() === "other"
      );

      if (otherEntries.length > 0) {
        // Group by the custom note label so identical descriptions merge.
        const subMap = new Map();
        for (const entry of otherEntries) {
          // entry.label comes from record.note — the free-text the user typed.
          const note =
            entry.label &&
            !["other", "expense", "Other", "Expense"].includes(entry.label)
              ? entry.label
              : null;
          const lbl = note ? `Other (${note})` : "Other";
          subMap.set(lbl, (subMap.get(lbl) || 0) + Number(entry.amount || 0));
        }
        for (const [lbl, val] of subMap.entries()) {
          if (val > 0) items.push({ label: lbl, value: val });
        }
      } else {
        // Fallback: no individual history to expand from.
        items.push({ label: "Other", value: amount });
      }
    } else {
      // Known types → fixed label; unknown raw types → title-cased as-is.
      const label = TYPE_LABEL_MAP[type] ?? capitalize(type);
      items.push({ label, value: amount });
    }
  }

  return items;
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ─── component ───────────────────────────────────────────────────────────────

export default function ExpenseDetailPanel({ row, onClose }) {
  if (!row) return null;

  const { initials, bg } = getInitialsAndColor(row.employeeName);
  const total   = row.totalAdvance    ?? 0;
  const remain  = row.remainingAmount ?? 0;
  const history = row.paymentHistory  ?? [];

  const displayRows = buildDisplayRows(row.breakdown ?? {}, history);

  return (
    <div style={{
      width: 360, flexShrink: 0,
      background: "#fff", border: `1px solid ${BORDER}`,
      borderRadius: "12px", display: "flex", flexDirection: "column",
      overflow: "hidden",
    }}>

      {/* ── HEADER ── */}
      <div style={{ padding: "20px 20px 16px", display: "flex", alignItems: "flex-start", gap: 14 }}>
        <div style={{
          width: 44, height: 44, borderRadius: "50%", background: bg,
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>{initials}</span>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 16, fontWeight: 700, color: DARK, margin: 0, lineHeight: "22px", wordBreak: "break-word" }}>
            {row.employeeName}
          </p>
        </div>

        <button
          onClick={onClose}
          style={{
            width: 28, height: 28, border: "none", background: "transparent",
            borderRadius: "50%", cursor: "pointer", color: GRAY, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, fontFamily: "inherit", lineHeight: 1,
          }}
        >×</button>
      </div>

      {/* ── BREAKDOWN ── */}
      <div style={{ padding: "0 20px 16px" }}>
        {/* Total */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
          <span style={{ fontSize: 13, color: GRAY }}>Total Expense Amount</span>
          <span style={{ fontSize: 16, fontWeight: 700, color: DARK }}>AED {total.toFixed(0)}</span>
        </div>

        {/* Dynamic per-category rows — only what was actually added */}
        {displayRows.length === 0 ? (
          <p style={{ fontSize: 13, color: GRAY, margin: "8px 0" }}>No categories yet</p>
        ) : (
          displayRows.map(({ label, value }) => (
            <div
              key={label}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}
            >
              <span style={{ fontSize: 13, color: GRAY }}>{label}</span>
              <span style={{ fontSize: 13, color: DARK }}>
                <span style={{ color: GRAY, marginRight: 3 }}>AED</span>
                {value.toFixed(0)}
              </span>
            </div>
          ))
        )}

        <div style={{ height: 1, background: BORDER, margin: "14px 0" }} />

        {/* Remain Amount */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontSize: 13, color: GRAY }}>Remain Amount</span>
          <span style={{ fontSize: 22, fontWeight: 700, color: DARK }}>AED {remain.toFixed(0)}</span>
        </div>
      </div>

      {/* ── PAYMENT HISTORY ── */}
      <div style={{ borderTop: `1px solid ${BORDER}`, flex: 1, overflow: "auto" }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: DARK, margin: 0, padding: "14px 20px 10px" }}>
          Payment history
        </p>

        <div style={{ padding: "0 20px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
          {history.length === 0 && (
            <p style={{ fontSize: 13, color: GRAY, margin: 0, textAlign: "center", padding: "8px 0" }}>
              No history yet
            </p>
          )}
          {history.map((item, idx) => (
            <div
              key={idx}
              style={{
                border: `1px solid ${BORDER}`, borderRadius: 10,
                padding: "12px 14px", display: "flex", alignItems: "flex-start",
                justifyContent: "space-between", background: "var(--bg-surface)",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <MoneyFlowIcon direction={isDeductionType(item.type) ? "out" : "in"} />
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: BLUE, margin: 0 }}>
                    {item.label}
                  </p>
                  <p style={{ fontSize: 13, fontWeight: 600, color: DARK, margin: 0 }}>
                    AED <strong>{Number(item.amount).toFixed(2)}</strong>
                  </p>
                </div>
              </div>
              <span style={{ fontSize: 12, color: GRAY, whiteSpace: "nowrap" }}>{item.date}</span>
            </div>
          ))}
        </div>
      </div>
      {/* Edit / Delete intentionally omitted — read-only history panel */}
    </div>
  );
}