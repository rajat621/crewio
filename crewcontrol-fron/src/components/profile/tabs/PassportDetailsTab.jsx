import React, { useEffect, useRef, useState } from 'react';
import { ProfileSection } from '../ProfileSection';
import { ProfileField } from '../ProfileField';

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
  passportNo: employee.passportNo || '',
  passportExpiry: toInputDate(employee.passportExpiry),
  passportCopy: employee.passportCopy || '',
});

const fileUploadStyles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    minHeight: '44px',
    padding: '10px 14px',
    backgroundColor: '#FFFFFF',
    borderRadius: '6px',
    border: '1px solid #DEDEDE',
    boxSizing: 'border-box',
  },
  fileBadge: {
    width: '36px',
    height: '36px',
    borderRadius: '8px',
    backgroundColor: '#FEE2E2',
    color: '#DC2626',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    fontWeight: '700',
    flexShrink: 0,
  },
  fileName: {
    fontSize: '14px',
    color: '#6B7280',
  },
  uploadButton: {
    marginLeft: 'auto',
    fontSize: '13px',
    color: '#1D4ED8',
    cursor: 'pointer',
    fontWeight: '600',
    border: '1px solid #BFDBFE',
    backgroundColor: '#EFF6FF',
    padding: '4px 10px',
    borderRadius: '6px',
  },
};

/**
 * FileUpload - Reusable file upload component
 */
const FileUpload = ({ fileName, onUpload, isEditing }) => {
  const inputRef = useRef(null);

  const handlePickFile = () => {
    inputRef.current?.click();
  };

  const displayName = fileName || 'No file uploaded';

  return isEditing ? (
    <div style={fileUploadStyles.container}>
      <input
        type="file"
        ref={inputRef}
        style={{ display: 'none' }}
        accept=".pdf,.png,.jpg,.jpeg"
        onChange={(e) => onUpload?.(e.target.files?.[0])}
      />
      <span style={fileUploadStyles.fileBadge}>PDF</span>
      <span style={fileUploadStyles.fileName}>{displayName}</span>
      <button style={fileUploadStyles.uploadButton} onClick={handlePickFile} type="button">
        Upload
      </button>
    </div>
  ) : (
    <div style={fileUploadStyles.container}>
      <span style={fileUploadStyles.fileBadge}>PDF</span>
      <span style={fileUploadStyles.fileName}>{displayName}</span>
    </div>
  );
};

/**
 * PassportDetailsTab - Display and edit passport information
 * @param {Object} employee - Employee data
 * @param {Function} onUpdate - Callback for updates
 */
export const PassportDetailsTab = ({ employee = {}, onUpdate = () => {} }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState(mapEmployeeToForm(employee));

  useEffect(() => {
    setFormData(mapEmployeeToForm(employee));
    setIsEditing(false);
  }, [employee]);

  const handleFieldChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleFileUpload = (file) => {
    setFormData((prev) => ({ ...prev, passportCopy: file?.name || '' }));
  };

  const handleSave = () => {
    onUpdate(formData);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setFormData(mapEmployeeToForm(employee));
    setIsEditing(false);
  };

  return (
    <ProfileSection
      title="Passport Details"
      showEdit={true}
      isEditing={isEditing}
      onEdit={() => setIsEditing(true)}
      onCancel={handleCancel}
      onSave={handleSave}
      singleColumn={true}
    >
      <div style={{ maxWidth: '580px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <ProfileField
          label="Passport No"
          value={formData.passportNo}
          isEditing={isEditing}
          onChange={(value) => handleFieldChange('passportNo', value)}
        />
        <ProfileField
          label="Passport Expiry Date"
          value={formData.passportExpiry}
          isEditing={isEditing}
          type="date"
          onChange={(value) => handleFieldChange('passportExpiry', value)}
        />
        <div style={{ gridColumn: '1 / -1' }}>
          <label
            style={{
              fontSize: '13px',
              fontWeight: '500',
              color: '#6B7280',
              display: 'block',
              marginBottom: '8px',
            }}
          >
            Upload Passport Copy
          </label>
          <FileUpload
            fileName={formData.passportCopy}
            onUpload={handleFileUpload}
            isEditing={isEditing}
          />
        </div>
      </div>
    </ProfileSection>
  );
};

export default PassportDetailsTab;
