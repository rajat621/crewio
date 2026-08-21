import React, { useEffect, useRef, useState } from 'react';
import { ProfileSection } from '../ProfileSection';
import { ProfileField } from '../ProfileField';
import { useDocumentUpload, DOCUMENT_ACCEPT_ATTR } from '../../../hooks/useDocumentUpload';
import { employeesApi } from '../../../api/employees';

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
  emiratesId: employee.emiratesId || employee.employeeId || '',
  emiratesIdExpiry: toInputDate(employee.emiratesIdExpiry),
  emiratesIdCopy: employee.emiratesIdCopy || '',
  laborCardCopy: employee.laborCardCopy || '',
  medicalCertificateCopy: employee.medicalCertificateCopy || '',
  residenceIdCopy: employee.residenceIdCopy || '',
  contractPaperCopy: employee.contractPaperCopy || '',
  workmenCompensationCopy: employee.workmenCompensationCopy || '',
});

const getUploadDisplayName = (value) => {
  if (!value) return 'No file uploaded';
  if (typeof value !== 'string') return 'Uploaded file';
  // Both the legacy Base64 data URLs already stored on older employee
  // records and the new /api/upload-backed references
  // (/api/files/<id>) are opaque - neither is a readable filename, so
  // both get the same friendly generic label.
  if (value.startsWith('data:') || value.startsWith('/api/files/')) return 'Uploaded file';
  return value;
};

const fileUploadStyles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    minHeight: '44px',
    padding: '10px 14px',
    backgroundColor: 'var(--bg-surface)',
    borderRadius: '6px',
    border: '1px solid var(--border-card)',
    boxSizing: 'border-box',
  },
  fileBadge: {
    width: '36px',
    height: '36px',
    borderRadius: '8px',
    backgroundColor: 'var(--bg-error-soft)',
    color: 'var(--color-error)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    fontWeight: '700',
    flexShrink: 0,
  },
  fileName: {
    fontSize: '14px',
    color: 'var(--text-secondary)',
  },
  uploadButton: {
    fontSize: '13px',
    color: 'var(--color-primary)',
    cursor: 'pointer',
    fontWeight: '600',
    border: '1px solid #BFDBFE',
    backgroundColor: '#EFF6FF',
    padding: '4px 10px',
    borderRadius: '6px',
  },
  previewButton: {
    fontSize: '13px',
    color: 'var(--color-primary)',
    cursor: 'pointer',
    fontWeight: '600',
    border: '1px solid #BFDBFE',
    backgroundColor: '#fff',
    padding: '4px 10px',
    borderRadius: '6px',
  },
  removeButton: {
    fontSize: '13px',
    color: 'var(--color-error)',
    cursor: 'pointer',
    fontWeight: '600',
    border: '1px solid #FECACA',
    backgroundColor: '#FEF2F2',
    padding: '4px 10px',
    borderRadius: '6px',
  },
  retryButton: {
    fontSize: '13px',
    color: 'var(--color-primary)',
    cursor: 'pointer',
    fontWeight: '600',
    border: '1px solid #BFDBFE',
    backgroundColor: '#fff',
    padding: '4px 10px',
    borderRadius: '6px',
  },
};

/**
 * FileUpload - Reusable file upload component. Uploads immediately on
 * selection (multipart, via useDocumentUpload) instead of converting to
 * Base64 - fileName here is actually whatever reference (URL) is currently
 * stored, not a real filename; see getUploadDisplayName.
 */
const FileUpload = ({ fileName, onUpload, onRemove, isEditing, status, error, progress, canRetry, onRetry }) => {
  const inputRef = useRef(null);
  const isUploading = status === 'uploading';
  const hasError = status === 'error';

  const handlePickFile = () => {
    if (isUploading) return; // prevent duplicate uploads while one is in flight
    inputRef.current?.click();
  };

  const displayName = getUploadDisplayName(fileName);
  // fileName is the actual URL/reference the file was uploaded to (see the
  // component comment above) - Preview just opens it directly.
  // fileName is the stored fileUrl (see the component comment above) -
  // GET /api/files/:id requires a Bearer token read off the request header,
  // which a plain window.open() navigation never carries (browsers don't
  // attach custom headers to top-level navigation, only cookies - and this
  // app authenticates with localStorage, not a cookie). employeesApi.
  // previewDocument fetches it through the authenticated client instead.
  const handlePreview = () => fileName && employeesApi.previewDocument(fileName);

  if (!isEditing) {
    return (
      <div style={fileUploadStyles.container}>
        <span style={fileUploadStyles.fileBadge}>PDF</span>
        <span style={fileUploadStyles.fileName}>{displayName}</span>
        {fileName && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
            <button style={fileUploadStyles.previewButton} onClick={handlePreview} type="button">
              Preview
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div style={fileUploadStyles.container}>
        <input
          type="file"
          ref={inputRef}
          style={{ display: 'none' }}
          accept={DOCUMENT_ACCEPT_ATTR}
          onChange={(e) => {
            onUpload?.(e.target.files?.[0]);
            // Allow picking the identical file again later (e.g. after Remove).
            e.target.value = '';
          }}
        />
        <span style={fileUploadStyles.fileBadge}>PDF</span>
        <span style={fileUploadStyles.fileName}>
          {isUploading ? `Uploading... ${progress || 0}%` : displayName}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
          {!isUploading && fileName && (
            <button style={fileUploadStyles.previewButton} onClick={handlePreview} type="button">
              Preview
            </button>
          )}
          {!isUploading && fileName && (
            <button style={fileUploadStyles.removeButton} onClick={() => onRemove?.()} type="button">
              Remove
            </button>
          )}
          {hasError && canRetry && (
            <button style={fileUploadStyles.retryButton} onClick={() => onRetry?.()} type="button">
              Retry
            </button>
          )}
          <button style={fileUploadStyles.uploadButton} onClick={handlePickFile} type="button" disabled={isUploading}>
            {fileName ? 'Replace' : 'Upload'}
          </button>
        </div>
      </div>
      {hasError && (
        <p style={{ color: 'var(--color-error)', fontSize: '12px', margin: '4px 0 0' }}>{error}</p>
      )}
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
  const formDataRef = useRef(formData);
  formDataRef.current = formData;

  const { status, errors: uploadErrors, progress, upload, retry, remove, canRetry } = useDocumentUpload();

  useEffect(() => {
    setFormData(mapEmployeeToForm(employee));
    setIsEditing(false);
  }, [employee]);

  const handleFieldChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleFileUpload = (field, file) => {
    if (!file) return;
    upload(field, file, (fileUrl) => {
      setFormData({ ...formDataRef.current, [field]: fileUrl });
    });
  };

  const handleFileRemove = (field) => {
    remove(field, () => setFormData({ ...formDataRef.current, [field]: '' }));
  };

  const handleFileRetry = (field) => {
    retry(field, (fileUrl) => setFormData({ ...formDataRef.current, [field]: fileUrl }));
  };

  const handleSave = () => {
    onUpdate(formData);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setFormData(mapEmployeeToForm(employee));
    setIsEditing(false);
  };

  // Bundles the shared upload-state props for a given field so each
  // FileUpload call site below only needs to name the field once.
  const uploadProps = (field) => ({
    status: status[field],
    error: uploadErrors[field],
    progress: progress[field],
    canRetry: canRetry(field),
    onUpload: (file) => handleFileUpload(field, file),
    onRemove: () => handleFileRemove(field),
    onRetry: () => handleFileRetry(field),
  });

  return (
    <ProfileSection
      title="Uploaded Document’s"
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
              color: 'var(--text-secondary)',
              display: 'block',
              marginBottom: '8px',
            }}
          >
            Upload Passport Copy
          </label>
          <FileUpload
            fileName={formData.passportCopy}
            isEditing={isEditing}
            {...uploadProps('passportCopy')}
          />
        </div>

        <div style={{ gridColumn: '1 / -1' }}>
          <ProfileField
            label="Emirates ID"
            value={formData.emiratesId}
            isEditing={isEditing}
            onChange={(value) => handleFieldChange('emiratesId', value)}
          />
        </div>

        <ProfileField
          label="Emirates ID Expiry Date"
          value={formData.emiratesIdExpiry}
          isEditing={isEditing}
          type="date"
          onChange={(value) => handleFieldChange('emiratesIdExpiry', value)}
        />

        <div style={{ gridColumn: '1 / -1' }}>
          <label
            style={{
              fontSize: '13px',
              fontWeight: '500',
              color: 'var(--text-secondary)',
              display: 'block',
              marginBottom: '8px',
            }}
          >
            Emirates Card Copy
          </label>
          <FileUpload
            fileName={formData.emiratesIdCopy}
            isEditing={isEditing}
            {...uploadProps('emiratesIdCopy')}
          />
        </div>

        <div style={{ gridColumn: '1 / -1' }}>
          <label
            style={{
              fontSize: '13px',
              fontWeight: '500',
              color: 'var(--text-secondary)',
              display: 'block',
              marginBottom: '8px',
            }}
          >
            Labor Card Copy
          </label>
          <FileUpload
            fileName={formData.laborCardCopy}
            isEditing={isEditing}
            {...uploadProps('laborCardCopy')}
          />
        </div>

        <div style={{ gridColumn: '1 / -1' }}>
          <label
            style={{
              fontSize: '13px',
              fontWeight: '500',
              color: 'var(--text-secondary)',
              display: 'block',
              marginBottom: '8px',
            }}
          >
            Medical Certificate Copy
          </label>
          <FileUpload
            fileName={formData.medicalCertificateCopy}
            isEditing={isEditing}
            {...uploadProps('medicalCertificateCopy')}
          />
        </div>

        <div style={{ gridColumn: '1 / -1' }}>
          <label
            style={{
              fontSize: '13px',
              fontWeight: '500',
              color: 'var(--text-secondary)',
              display: 'block',
              marginBottom: '8px',
            }}
          >
            Residence ID Copy
          </label>
          <FileUpload
            fileName={formData.residenceIdCopy}
            isEditing={isEditing}
            {...uploadProps('residenceIdCopy')}
          />
        </div>

        <div style={{ gridColumn: '1 / -1' }}>
          <label
            style={{
              fontSize: '13px',
              fontWeight: '500',
              color: 'var(--text-secondary)',
              display: 'block',
              marginBottom: '8px',
            }}
          >
            Contract Paper Copy
          </label>
          <FileUpload
            fileName={formData.contractPaperCopy}
            isEditing={isEditing}
            {...uploadProps('contractPaperCopy')}
          />
        </div>

        <div style={{ gridColumn: '1 / -1' }}>
          <label
            style={{
              fontSize: '13px',
              fontWeight: '500',
              color: 'var(--text-secondary)',
              display: 'block',
              marginBottom: '8px',
            }}
          >
            Workmen Compensation Copy
          </label>
          <FileUpload
            fileName={formData.workmenCompensationCopy}
            isEditing={isEditing}
            {...uploadProps('workmenCompensationCopy')}
          />
        </div>
      </div>
    </ProfileSection>
  );
};

export default PassportDetailsTab;