import React, { useEffect, useState } from 'react';
import { ProfileSection } from '../ProfileSection';

const toInputDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const mapEmployeeToForm = (employee) => ({
  trade: employee.trade || '',
  joiningDate: toInputDate(employee.joiningDate),
  ratePerHour: employee.ratePerHour || '',
  employmentType: employee.employmentType || '',
  overtimeRate: employee.overtimeRate || '',
});

const fieldStyles = {
  fieldWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  label: {
    fontSize: '14px',
    fontWeight: '400',
    color: 'var(--text-primary)',
    margin: 0,
  },
  inputWrap: {
    width: '100%',
    height: '44px',
    border: '1px solid var(--border-card)',
    borderRadius: '8px',
    backgroundColor: 'var(--bg-surface)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 12px',
    boxSizing: 'border-box',
  },
  textValue: {
    fontSize: '14px',
    color: 'var(--text-disabled)',
  },
  input: {
    width: '100%',
    height: '100%',
    border: 'none',
    outline: 'none',
    fontSize: '14px',
    color: 'var(--text-primary)',
    backgroundColor: 'transparent',
  },
  suffix: {
    fontSize: '14px',
    color: 'var(--text-disabled)',
    marginLeft: '8px',
  },
  icon: {
    width: '16px',
    height: '16px',
    color: 'var(--text-disabled)',
    flexShrink: 0,
    marginLeft: '8px',
  },
};

const ChevronDownIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={fieldStyles.icon} aria-hidden="true">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const CalendarIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={fieldStyles.icon} aria-hidden="true">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

const formatDateDisplay = (value) => {
  if (!value) return 'DD/MM/YYYY';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'DD/MM/YYYY';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

const formatMoneyDisplay = (value) => {
  if (value === '' || value === null || value === undefined) return '0.00';
  const num = Number(value);
  if (Number.isNaN(num)) return '0.00';
  return num.toFixed(2);
};

const selectInputStyle = {
  ...fieldStyles.input,
  appearance: 'none',
  WebkitAppearance: 'none',
  MozAppearance: 'none',
};

/**
 * WorkDetailsTab - Display and edit employee work information
 * @param {Object} employee - Employee data
 * @param {Function} onUpdate - Callback for updates
 */
export const WorkDetailsTab = ({ employee = {}, onUpdate = () => {} }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState(mapEmployeeToForm(employee));

  useEffect(() => {
    setFormData(mapEmployeeToForm(employee));
    setIsEditing(false);
  }, [employee]);

  const handleFieldChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    onUpdate(formData);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setFormData(mapEmployeeToForm(employee));
    setIsEditing(false);
  };


  const employmentTypeOptions = [
    { value: 'full-time', label: 'Full Time' },
    { value: 'contract', label: 'Contract' },
    { value: 'daily', label: 'Daily' },
  ];

  const renderSelectField = ({ label, value, placeholder, options, onChange }) => (
    <div style={fieldStyles.fieldWrap}>
      <p style={fieldStyles.label}>{label}</p>
      <div style={fieldStyles.inputWrap}>
        {isEditing ? (
          <select style={selectInputStyle} value={value || ''} onChange={(e) => onChange(e.target.value)}>
            <option value="">{placeholder}</option>
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        ) : (
          <span style={fieldStyles.textValue}>
            {options.find((opt) => opt.value === value)?.label || placeholder}
          </span>
        )}
        <ChevronDownIcon />
      </div>
    </div>
  );

  const renderDateField = ({ label, value, onChange }) => (
    <div style={fieldStyles.fieldWrap}>
      <p style={fieldStyles.label}>{label}</p>
      <div style={fieldStyles.inputWrap}>
        {isEditing ? (
          <input type="date" style={fieldStyles.input} value={value || ''} onChange={(e) => onChange(e.target.value)} />
        ) : (
          <span style={fieldStyles.textValue}>{formatDateDisplay(value)}</span>
        )}
      </div>
    </div>
  );
const renderTextField = ({ label, value, placeholder, onChange }) => (
  <div style={fieldStyles.fieldWrap}>
    <p style={fieldStyles.label}>{label}</p>
    <div style={fieldStyles.inputWrap}>
      {isEditing ? (
        <input
          type="text"
          style={fieldStyles.input}
          value={value || ''}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <span style={fieldStyles.textValue}>{value || placeholder}</span>
      )}
    </div>
  </div>
);
  const renderMoneyField = ({ label, value, onChange }) => (
    <div style={fieldStyles.fieldWrap}>
      <p style={fieldStyles.label}>{label}</p>
      <div style={fieldStyles.inputWrap}>
        {isEditing ? (
          <input
            type="number"
            min="0"
            step="0.01"
            style={fieldStyles.input}
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder="0.00"
          />
        ) : (
          <span style={fieldStyles.textValue}>{formatMoneyDisplay(value)}</span>
        )}
        <span style={fieldStyles.suffix}>AED</span>
      </div>
    </div>
  );

  return (
    <ProfileSection
      title="Work Details"
      showEdit={true}
      isEditing={isEditing}
      onEdit={() => setIsEditing(true)}
      onCancel={handleCancel}
      onSave={handleSave}
      singleColumn={true}
    >
      <div style={{ maxWidth: '580px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
{renderTextField({
  label: 'Trade',
  value: formData.trade,
  placeholder: 'Enter trade',
  onChange: (value) => handleFieldChange('trade', value),
})}

        {renderDateField({
          label: 'Joining Date',
          value: formData.joiningDate,
          onChange: (value) => handleFieldChange('joiningDate', value),
        })}

        {renderMoneyField({
          label: 'Rate per Hour (AED)',
          value: formData.ratePerHour,
          onChange: (value) => handleFieldChange('ratePerHour', value),
        })}

        {renderSelectField({
          label: 'Employment Type',
          value: formData.employmentType,
          placeholder: 'Select Type',
          options: employmentTypeOptions,
          onChange: (value) => handleFieldChange('employmentType', value),
        })}

        {renderMoneyField({
          label: 'Overtime Rate (optional)',
          value: formData.overtimeRate,
          onChange: (value) => handleFieldChange('overtimeRate', value),
        })}
      </div>
    </ProfileSection>
  );
};

export default WorkDetailsTab;

