import React, { useEffect, useRef, useState } from 'react';
import AddAPhotoIcon from '@mui/icons-material/AddAPhoto';

const profileHeaderStyles = {
  container: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '20px',
    padding: '20px 16px',
    backgroundColor: '#FFFFFF',
    border: '1px solid #E5E7EB',
    borderRadius: '8px',
    marginBottom: '16px',
  },
  content: {
    display: 'flex',
    gap: '20px',
    flex: '1',
    alignItems: 'center',
  },
  avatar: {
    position: 'relative',
    width: '92px',
    height: '92px',
    minWidth: '92px',
    overflow: 'visible',
  },
  avatarCircle: {
    width: '100%',
    height: '100%',
    borderRadius: '50%',
    backgroundColor: '#D1D5DB',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#6B7280',
    fontSize: '32px',
    fontWeight: '600',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  avatarUploadButton: {
    position: 'absolute',
    right: '-2px',
    bottom: '-2px',
    width: '34px',
    height: '34px',
    borderRadius: '50%',
    border: '2px solid #FFFFFF',
    backgroundColor: '#1D4ED8',
    color: '#FFFFFF',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    zIndex: 2,
    boxShadow: '0 2px 8px rgba(29, 78, 216, 0.28)',
  },
  info: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  name: {
    fontSize: '24px',
    fontWeight: '600',
    color: '#141414',
    margin: '0',
  },
  meta: {
    fontSize: '14px',
    lineHeight: '14px',
    letterSpacing: '0.28px',
    color: '#6B7280',
    margin: '0',
  },
  editButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: '#FFFFFF',
    border: '1px solid #D1D5DB',
    color: '#808080',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '500',
    padding: '0 12px',
    height: '32px',
    borderRadius: '8px',
    transition: 'all 0.2s ease',
    outline: 'none',
    boxShadow: 'none',
  },
  editButtonHover: {
    color: '#1D4ED8',
    borderColor: '#93C5FD',
    backgroundColor: '#EFF6FF',
    outline: 'none',
    boxShadow: 'none',
  },
  cancelButton: {
    backgroundColor: '#FFFFFF',
    border: '1px solid transparent',
    color: '#808080',
  },
  saveButton: {
    backgroundColor: '#1D4ED8',
    border: '1px solid #1D4ED8',
    color: '#FFFFFF',
  },
  icon: {
    width: '14px',
    height: '14px',
  },
  fileInput: {
    display: 'none',
  },
  actionGroup: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
  },
};

const EditStrokeIcon = ({ color = '#6B7280' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={profileHeaderStyles.icon}
    aria-hidden="true"
  >
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
  </svg>
);

/**
 * EmployeeProfileHeader - Profile header with avatar, name, and edit button
 * @param {Object} employee - Employee data object
 * @param {Function} onEdit - Callback when edit button clicked
 */
export const EmployeeProfileHeader = ({ employee, onEdit, onAvatarChange }) => {
  const [editButtonHover, setEditButtonHover] = useState(false);
  const [isEditingAvatar, setIsEditingAvatar] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState(employee?.avatar || '');
  const [originalAvatar, setOriginalAvatar] = useState(employee?.avatar || '');
  const fileInputRef = useRef(null);

  useEffect(() => {
    setAvatarPreview(employee?.avatar || '');
    setOriginalAvatar(employee?.avatar || '');
  }, [employee?.avatar]);

  const getInitials = (firstName, lastName) => {
    return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase();
  };

  const initials = getInitials(employee?.firstName, employee?.lastName);
  const companyName = employee?.assignedCompanyId?.name || employee?.company || 'Company name';

  const handleEditClick = (event) => {
    // remove focus from the button immediately to avoid stuck focus/hover styles
    try {
      event?.currentTarget?.blur?.();
    } catch (e) {}
    setOriginalAvatar(avatarPreview);
    setIsEditingAvatar((current) => !current);
    onEdit?.();
  };

  const handleCancelClick = () => {
    setAvatarPreview(originalAvatar);
    onAvatarChange?.(originalAvatar);
    setIsEditingAvatar(false);
  };

  const handleSaveClick = () => {
    setOriginalAvatar(avatarPreview);
    setIsEditingAvatar(false);
  };

  const handleAvatarClick = () => {
    if (!isEditingAvatar) return;
    fileInputRef.current?.click();
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      return;
    }

    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      const nextAvatar = readerEvent.target?.result || '';
      setAvatarPreview(nextAvatar);
      onAvatarChange?.(nextAvatar);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div style={profileHeaderStyles.container}>
      <div style={profileHeaderStyles.content}>
        <div
          style={{
            ...profileHeaderStyles.avatar,
            cursor: isEditingAvatar ? 'pointer' : 'default',
          }}
          onClick={handleAvatarClick}
          role={isEditingAvatar ? 'button' : undefined}
          tabIndex={isEditingAvatar ? 0 : -1}
        >
          <div style={profileHeaderStyles.avatarCircle}>
            {avatarPreview ? (
              <img src={avatarPreview} alt="Employee avatar" style={profileHeaderStyles.avatarImage} />
            ) : (
              initials || '👤'
            )}
          </div>

          {isEditingAvatar && (
            <button
              type="button"
              onClick={handleAvatarClick}
              aria-label="Upload employee avatar"
              style={profileHeaderStyles.avatarUploadButton}
            >
              <AddAPhotoIcon sx={{ fontSize: 18 }} />
            </button>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            style={profileHeaderStyles.fileInput}
          />
        </div>
        <div style={profileHeaderStyles.info}>
          <h2 style={profileHeaderStyles.name}>
            {employee?.firstName || 'Employee'} {employee?.lastName || 'name'}
          </h2>
          <p style={profileHeaderStyles.meta}>{companyName}</p>
          <p style={profileHeaderStyles.meta}>{employee?.employeeId || 'Employee ID'}</p>
        </div>
      </div>
      {!isEditingAvatar ? (
        <button
          onClick={handleEditClick}
          onMouseEnter={() => setEditButtonHover(true)}
          onMouseLeave={() => setEditButtonHover(false)}
          onMouseDown={(e) => e.currentTarget.blur()}
          onMouseUp={() => setEditButtonHover(false)}
          onBlur={() => setEditButtonHover(false)}
          style={{
            ...profileHeaderStyles.editButton,
            border: `1px solid ${editButtonHover ? '#93C5FD' : '#D1D5DB'}`,
            color: editButtonHover ? '#1D4ED8' : profileHeaderStyles.editButton.color,
            backgroundColor: editButtonHover ? '#EFF6FF' : profileHeaderStyles.editButton.backgroundColor,
          }}
          aria-label="Edit employee profile"
        >
          <EditStrokeIcon color={editButtonHover ? '#1D4ED8' : '#6B7280'} />
          <span>Edit</span>
        </button>
      ) : (
        <div style={profileHeaderStyles.actionGroup}>
          <button
            type="button"
            onClick={handleCancelClick}
            style={{
              ...profileHeaderStyles.editButton,
              ...profileHeaderStyles.cancelButton,
            }}
            aria-label="Cancel avatar edit"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSaveClick}
            style={{
              ...profileHeaderStyles.editButton,
              ...profileHeaderStyles.saveButton,
            }}
            aria-label="Save avatar edit"
          >
            Save
          </button>
        </div>
      )}
    </div>
  );
};

export default EmployeeProfileHeader;
