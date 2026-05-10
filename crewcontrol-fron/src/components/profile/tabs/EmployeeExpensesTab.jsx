import React, { useEffect, useState } from 'react';
import { ProfileSection } from '../ProfileSection';
import { Height } from '@mui/icons-material';

const S = {
  /* ── Layout ─────────────────────────────────────────────── */
  // Outer flex: left column (fixed 580px) + gap + right column
  container: {
    display: 'flex',
    gap: '24px',
    alignItems: 'flex-start',
    width: '100%',
  },
  leftColumn: {
    flex: '0 0 580px',
    width: '580px',           // fixed 580px — all table content fits here
    flexShrink: 0,
    flexGrow: 0,
  },
  rightColumn: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    flexShrink: 0,
    width: '240px',
    flex: '0 0 240px',
    paddingTop: '4px',
    marginLeft: 'auto',
    paddingRight: '16px',
  },

  /* ── Category group ──────────────────────────────────────── */
  categoryWrap: {
    marginBottom: '32px',
  },
  categoryTitle: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#141414',
    marginBottom: '8px',
    lineHeight:"28px",
    letterSpacing: '0.56px',
  },

  /* ── Table ───────────────────────────────────────────────── */
  // Total: 580px = 280 (expense type) + 160 (amount) + 140 (receipt)
  table: {
    width: '100%',            // stretches to 580px (left column width)
    borderCollapse: 'separate',
      borderSpacing: '0 8px', 
    tableLayout: 'fixed',
  },
  th: {
    fontSize: '10px',
    fontWeight: '600',
    color: '#9CA3AF',
    textAlign: 'left',
    padding: '0 0 5px 0',
    lineHeight: '20px',
    borderBottom: '1px solid #DEDEDE',
    letterSpacing: '0.2px',
    textTransform: 'uppercase',
  },
  // Column widths sum to 580px
  thExpenseType: { width: '280px' },
  thAmount:      { width: '160px' },
  thReceipt:     { width: '140px', textAlign: 'right' },  // Receipt header right-aligned

  td: {
    fontSize: '14px',
    color: '#374151',
    padding: '0',             // height controlled by inner content (44px cells)
    verticalAlign: 'middle',
    height: '44px',           // row height = 44px as per design
  },
  tdExpenseType: {
    width: '280px',
    wordBreak: 'break-word',
    fontWeight: '400',
    color: '#111827',
    paddingRight: '12px',
  },
  tdAmount: { width: '160px' },
  tdReceipt: {
    width: '140px',
    textAlign: 'right',       // Upload link right-aligned
  },

  /* ── Amount input box ────────────────────────────────────── */
  amountBox: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '130px',
    height: '44px',           // slightly shorter than row but visually balanced
    border: '1px solid #DEDEDE',
    borderRadius: '6px',
    padding: '0 10px',
    backgroundColor: '#FFFFFF',
    boxSizing: 'border-box',
  },
  amountBoxFocused: {
    borderColor: '#2563EB',
  },
  amountValue: {
    fontSize: '14px',
    color: 'rgba(128, 128, 128, 0.60)',
    flex: 1,
    minWidth: 0,
  },
  amountInput: {
    flex: 1,
    minWidth: 0,
    border: 'none',
    outline: 'none',
    backgroundColor: 'transparent',
    fontSize: '14px',
    color: '#141414',
    padding: 0,
    textAlign: 'left',
    fontFamily: 'inherit',
    width: '100%',
  },
  amountUnit: {
    fontSize: '11px',
    color: 'rgba(128, 128, 128, 0.60)',
    whiteSpace: 'nowrap',
    flexShrink: 0,
    marginLeft: '6px',
  },

  /* ── Upload link ─────────────────────────────────────────── */
  uploadLink: {
    fontSize: '12px',
    fontWeight: '500',
    color: '#1D4ED8',
    lineHeight: '20px',
    cursor: 'pointer',
    textDecoration: 'none',
    userSelect: 'none',
  },

  /* ── Summary cards ───────────────────────────────────────── */
  summaryCard: {
    width: '240px',
    // Height: '110px',
    backgroundColor: '#F6F6F6',
    border: '1px solid #DEDEDE',
    borderRadius: '8px',
    padding: '24px 20px',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  summaryLabel: {
    fontSize: '14px',
    lineHeight: 1.4,
    color: '#808080',
    fontWeight: '400',
  },
  summaryValueRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '4px',
  },
  summaryValue: {
    fontSize: '28px',
    fontWeight: '700',
    color: '#111827',
    lineHeight: 1,
    letterSpacing: '-0.5px',
  },
  summaryUnit: {
    fontSize: '12px',
    color: '#9CA3AF',
    fontWeight: '400',
  },
};

const EXPENSE_GROUPS = [
  {
    title: 'Recruitment & Legal',
    items: [
      { label: 'Offer Letter',                 key: 'offerLetter' },
      { label: 'Entry Permit',                  key: 'entryPermit' },
      { label: 'Tawjeeh Payment',               key: 'recruitment' },
      { label: 'Emirates ID',                   key: 'emiratesId' },
      { label: 'Visa Stamping',                 key: 'stampingFee' },
      { label: 'ILOE',                          key: 'icn' },
      { label: 'Emigration Card Cancellation',  key: 'emigrationCancellation' },
    ],
  },
  {
    title: 'Insurance & Medical',
    items: [
      { label: 'Insurance',              key: 'insurance' },
      { label: 'Medical (MOH)',          key: 'medical' },
      { label: 'Medical Insurance',      key: 'medicalInsurance' },
      { label: 'Workman Compensation',   key: 'workersCompensation' },
    ],
  },
  {
    title: 'Labor & Advance Payments',
    items: [
      { label: 'Labor Payment (Category 2)', key: 'laborPaymentCategory2' },
      { label: 'Labor Advance',              key: 'laborAdvance' },
    ],
  },
  {
    title: 'Employee Assets',
    items: [
      { label: 'Labor PPE',       key: 'laborPRE' },
      { label: 'Labor Mattress',  key: 'laborWPS' },
      { label: 'Labor Utensils',  key: 'laborPayment' },
      { label: 'Other equipment', key: 'otherExpenses' },
    ],
  },
];

/* ── Individual editable amount cell ───────────────────────── */
const AmountCell = ({ value, isEditing, onChange }) => {
  const [focused, setFocused] = useState(false);
  const display = Number(value || 0).toFixed(2);

  return (
    <div style={{ ...S.amountBox, ...(focused ? S.amountBoxFocused : {}) }}>
      {isEditing ? (
        <input
          type="number"
          min="0"
          step="0.01"
          value={String(value || '')}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="0.00"
          style={{ ...S.amountInput, WebkitAppearance: 'none', MozAppearance: 'textfield' }}
          autoComplete="off"
        />
      ) : (
        <span style={S.amountValue}>{display}</span>
      )}
      {/* "/ AED" — slash + unit, matching the design */}
      <span style={S.amountUnit}>/ AED</span>
    </div>
  );
};

/**
 * EmployeeExpensesTab — pixel-perfect implementation matching design spec
 */
export const EmployeeExpensesTab = ({ expenses = {}, onUpdate = () => {} }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState(expenses || {});

  useEffect(() => {
    setFormData(expenses || {});
    setIsEditing(false);
  }, [expenses]);

  const totalExpenses = Object.values(formData).reduce(
    (sum, val) => sum + (parseFloat(val) || 0),
    0
  );
  const returnExpenses = totalExpenses * 0.1;

  const handleAmountChange = (key, value) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    onUpdate({ expenses: formData });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setFormData(expenses || {});
    setIsEditing(false);
  };

  return (
    <div>
      <ProfileSection
        title="Employee Expenses"
        showEdit={true}
        isEditing={isEditing}
        onEdit={() => setIsEditing(true)}
        onCancel={handleCancel}
        onSave={handleSave}
        singleColumn={true}
      >
        <div style={S.container}>
          {/* ── Left: expense tables ───────────────────────── */}
          <div style={S.leftColumn}>
            {EXPENSE_GROUPS.map((group) => (
              <div key={group.title} style={S.categoryWrap}>
                <div style={S.categoryTitle}>{group.title}</div>

                <table style={S.table}>
                  <thead>
                    <tr>
                      <th style={{ ...S.th, ...S.thExpenseType }}>Expense Type</th>
                      <th style={{ ...S.th, ...S.thAmount }}>Amount (AED)</th>
                      <th style={{ ...S.th, ...S.thReceipt, textAlign: 'right' }}>Receipt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map((item) => (
                      <tr key={item.key}>
                        <td style={{ ...S.td, ...S.tdExpenseType }}>
                          {item.label}
                        </td>
                        <td style={{ ...S.td, ...S.tdAmount }}>
                          <AmountCell
                            value={formData[item.key]}
                            isEditing={isEditing}
                            onChange={(val) => handleAmountChange(item.key, val)}
                          />
                        </td>
                        <td style={{ ...S.td, ...S.tdReceipt }}>
                          <span style={S.uploadLink}>Upload</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>

          {/* ── Right: summary cards ───────────────────────── */}
          <div style={S.rightColumn}>
            <div style={S.summaryCard}>
              <div style={S.summaryLabel}>Total Expenses (AED)</div>
              <div style={S.summaryValueRow}>
                <div style={S.summaryValue}>{totalExpenses.toFixed(2)}</div>
                <div style={S.summaryUnit}>/employee</div>
              </div>
            </div>

            <div style={S.summaryCard}>
              <div style={S.summaryLabel}>Return Expenses (AED)</div>
              <div style={S.summaryValueRow}>
                <div style={S.summaryValue}>{returnExpenses.toFixed(2)}</div>
                <div style={S.summaryUnit}>/employee</div>
              </div>
            </div>
          </div>
        </div>
      </ProfileSection>
    </div>
  );
};

export default EmployeeExpensesTab;