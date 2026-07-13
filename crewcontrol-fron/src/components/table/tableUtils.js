// src/components/table/tableUtils.js

/* ================= SIZES ================= */
export const TABLE_ROW_HEIGHT = 44;
export const TABLE_HEADER_HEIGHT = 32;

/* ================= COMMON CELL ================= */
// NOTE: whiteSpace was previously "nowrap" with no overflow/textOverflow
// handling, so when the table's container shrank (e.g. the detail panel
// opening), cell text was clipped hard at the cell edge with no ellipsis
// and no wrap ("Acti...", "Vi"). We now allow content to wrap onto a
// second line instead, so every column stays fully readable regardless
// of how much horizontal space the table has.
export const CELL_SX = {
  fontSize: 12,
  py: "6px",              // small vertical padding so wrapped lines don't touch
  whiteSpace: "normal",
  wordBreak: "break-word",
  overflowWrap: "anywhere",
};

/* ================= HEADER CELL ================= */
export const HEADER_CELL_SX = {
  ...CELL_SX,
  fontWeight: 500,
  color: "text.secondary",
  height: TABLE_HEADER_HEIGHT,
  bgcolor: "var(--bg-surface)",    // matches your table header bg
};

/* ================= BODY CELL ================= */
export const BODY_CELL_SX = {
  ...CELL_SX,
  color: "text.primary",
};

/* ================= ACTION CELL ================= */
export const ACTION_CELL_SX = {
  ...CELL_SX,
  whiteSpace: "nowrap",   // "View" / icon actions should stay on one line
  textAlign: "center",
  verticalAlign: "middle",
};

export const ACTION_ICON_BUTTON_SX = {
  width: 28,
  height: 28,
  p: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

/* ================= ROW ================= */
export const ROW_SX = {
  minHeight: TABLE_ROW_HEIGHT,
  "&:last-child td": {
    borderBottom: 0,     // clean bottom edge like design
  },
};

