import React, { useState } from 'react';

const profileFieldStyles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  label: {
    fontSize: '14px',
    fontWeight: '400',
    color: 'var(--text-secondary)',
    textTransform: 'none',
  },
  readOnlyValue: {
    fontSize: '14px',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border-card)',
    borderRadius: '6px',
    backgroundColor: 'var(--bg-surface)',
    padding: '0 12px',
    minHeight: '44px',
    display: 'flex',
    alignItems: 'center',
  },
  input: {
    width: '100%',
    height: '44px',
    padding: '0 12px',
    fontSize: '14px',
    border: '1px solid var(--border-card)',
    borderRadius: '6px',
    fontFamily: 'inherit',
    color: 'var(--text-primary)',
    backgroundColor: 'var(--bg-surface)',
    transition: 'all 0.2s ease',
    outline: 'none',
    boxSizing: 'border-box',
  },
  inputFocus: {
    borderColor: 'var(--color-primary)',
    boxShadow: '0 0 0 2px rgba(29, 78, 216, 0.12)',
  },
  inputSuffix: {
    position: 'relative',
  },
  suffix: {
    position: 'absolute',
    right: '12px',
    top: '50%',
    transform: 'translateY(-50%)',
    fontSize: '13px',
    color: 'var(--text-secondary)',
    pointerEvents: 'none',
  },
  select: {
    width: '100%',
    height: '44px',
    padding: '0 12px',
    fontSize: '14px',
    border: '1px solid var(--border-card)',
    borderRadius: '6px',
    fontFamily: 'inherit',
    cursor: 'pointer',
    backgroundColor: 'var(--bg-surface)',
    color: 'var(--text-primary)',
    transition: 'all 0.2s ease',
    appearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236B7280' d='M1 4l5 4 5-4'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 10px center',
    paddingRight: '32px',
    outline: 'none',
    boxSizing: 'border-box',
  },
  selectFocus: {
    borderColor: 'var(--color-primary)',
    boxShadow: '0 0 0 2px rgba(29, 78, 216, 0.12)',
  },
  date: {
    width: '100%',
    height: '44px',
    padding: '0 12px',
    fontSize: '14px',
    border: '1px solid var(--border-card)',
    borderRadius: '6px',
    fontFamily: 'inherit',
    color: 'var(--text-primary)',
    backgroundColor: 'var(--bg-surface)',
    cursor: 'pointer',
    outline: 'none',
    boxSizing: 'border-box',
  },
  dateFocus: {
    borderColor: 'var(--color-primary)',
    boxShadow: '0 0 0 2px rgba(29, 78, 216, 0.12)',
  },
};

/**
 * ProfileField - Reusable field component for read-only or editable display
 * @param {string} label - Field label
 * @param {React.ReactNode} value - Field value (string or node)
 * @param {boolean} isEditing - If true, renders input; if false, renders read-only
 * @param {string} type - Input type: 'text', 'select', 'date', 'number', 'tel', 'email'
 * @param {Array} options - For select type: [{ value, label }]
 * @param {string} suffix - Optional suffix (e.g., "AED")
 * @param {Function} onChange - Callback for input changes
 * @param {Object} inputProps - Additional props to spread on input
 * @param {Object} containerStyle - Additional styles for outer field container
 */
export const ProfileField = ({
  label,
  value,
  isEditing,
  type = 'text',
  options = [],
  suffix,
  onChange,
  inputProps = {},
  containerStyle = {},
}) => {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <div style={{ ...profileFieldStyles.container, ...containerStyle }}>
      <label style={profileFieldStyles.label}>{label}</label>

      {!isEditing ? (
        <div style={profileFieldStyles.readOnlyValue}>{value || '—'}</div>
      ) : type === 'select' ? (
        <select
          style={{
            ...profileFieldStyles.select,
            ...(isFocused ? profileFieldStyles.selectFocus : {}),
          }}
          value={value || ''}
          onChange={(e) => onChange?.(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          {...inputProps}
        >
          <option value="">Select {label}</option>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : type === 'date' ? (
        <input
          type="date"
          style={{
            ...profileFieldStyles.date,
            ...(isFocused ? profileFieldStyles.dateFocus : {}),
          }}
          value={value || ''}
          onChange={(e) => onChange?.(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          {...inputProps}
        />
      ) : suffix ? (
        <div style={profileFieldStyles.inputSuffix}>
          <input
            type={type}
            style={{
              ...profileFieldStyles.input,
              ...(isFocused ? profileFieldStyles.inputFocus : {}),
            }}
            value={value || ''}
            onChange={(e) => onChange?.(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={`0.00`}
            {...inputProps}
          />
          <span style={profileFieldStyles.suffix}>{suffix}</span>
        </div>
      ) : (
        <input
          type={type}
          style={{
            ...profileFieldStyles.input,
            ...(isFocused ? profileFieldStyles.inputFocus : {}),
          }}
          value={value || ''}
          onChange={(e) => onChange?.(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          {...inputProps}
        />
      )}
    </div>
  );
};

export default ProfileField;

