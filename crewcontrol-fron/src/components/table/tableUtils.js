// src/components/table/tableUtils.js

/* ================= SIZES ================= */
export const TABLE_ROW_HEIGHT = 44;
export const TABLE_HEADER_HEIGHT = 32;

/* ================= COMMON CELL ================= */
export const CELL_SX = {
  fontSize: 12,
  py: 0,                 // 🔒 no vertical padding drift
  lineHeight: "44px",    // ✅ vertically centers content in 44px row
  whiteSpace: "nowrap",
};

/* ================= HEADER CELL ================= */
export const HEADER_CELL_SX = {
  ...CELL_SX,
  fontWeight: 500,
  color: "text.secondary",
  height: TABLE_HEADER_HEIGHT,
  lineHeight: "32px",
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
  height: TABLE_ROW_HEIGHT,
  "&:last-child td": {
    borderBottom: 0,     // clean bottom edge like design
  },
};

