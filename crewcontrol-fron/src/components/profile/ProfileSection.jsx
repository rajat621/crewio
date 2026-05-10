import React, { useState } from 'react';

const profileSectionStyles = {
  container: {
    border: '1px solid #E5E7EB',
    borderRadius: '8px',
    padding: '20px 16px',
    // marginTop: '24px',
    marginBottom: '0',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  title: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#141414',
    margin: '0',
  },
  actions: {
    display: 'flex',
    gap: '10px',
    alignItems: 'center',
  },
  editButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: '#FFFFFF',
    border: '1px solid #D1D5DB',
    color: '#6B7280',
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
    textTransform: 'none',
    color: '#1D4ED8',
    border: '1px solid #D1D5DB',
    borderRadius: '8px',
    backgroundColor: '#FFFFFF',
    padding: '0 16px',
    height: '32px',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  saveButton: {
    textTransform: 'none',
    color: '#FFFFFF',
    border: '1px solid #1D4ED8',
    borderRadius: '8px',
    backgroundColor: '#1D4ED8',
    padding: '0 16px',
    height: '32px',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  content: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
  },
  contentWrapper: {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: '24px', // space between left + right
},

  contentSingleColumn: {
    gridTemplateColumns: '1fr',
  },
  icon: {
    width: '14px',
    height: '14px',
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
    style={profileSectionStyles.icon}
    aria-hidden="true"
  >
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
  </svg>
);

/**
 * ProfileSection - Reusable section wrapper with title and edit button
 * @param {string} title - Section title
 * @param {React.ReactNode} children - Section content
 * @param {Function} onEdit - Optional callback when edit button clicked
 * @param {Function} onCancel - Optional callback when cancel clicked
 * @param {Function} onSave - Optional callback when save clicked
 * @param {boolean} isEditing - Whether section is in editing mode
 * @param {boolean} showEdit - Whether to show edit button (default: true)
 * @param {boolean} singleColumn - Whether content should render in one column
 */
export const ProfileSection = ({
  title,
  children,
  onEdit,
  onCancel,
  onSave,
  isEditing = false,
  showEdit = true,
  singleColumn = false,
}) => {
  const [editButtonHover, setEditButtonHover] = useState(false);

  return (
    <div style={profileSectionStyles.container}>
      <div style={profileSectionStyles.header}>
        <h3 style={profileSectionStyles.title}>{title}</h3>
        {showEdit ? (
          <div style={profileSectionStyles.actions}>
            {isEditing ? (
              <>
                <button onClick={onCancel} style={profileSectionStyles.cancelButton}>
                  Cancel
                </button>
                <button onClick={onSave} style={profileSectionStyles.saveButton}>
                  Save
                </button>
              </>
            ) : (
              <button
                onClick={onEdit}
                onMouseEnter={() => setEditButtonHover(true)}
                onMouseLeave={() => setEditButtonHover(false)}
                onMouseDown={(e) => e.currentTarget.blur()}
                onMouseUp={() => setEditButtonHover(false)}
                onBlur={() => setEditButtonHover(false)}
                style={{
                  ...profileSectionStyles.editButton,
                  border: `1px solid ${editButtonHover ? '#93C5FD' : '#D1D5DB'}`,
                  color: editButtonHover ? '#1D4ED8' : profileSectionStyles.editButton.color,
                  backgroundColor: editButtonHover ? '#EFF6FF' : profileSectionStyles.editButton.backgroundColor,
                }}
                aria-label={`Edit ${title}`}
              >
                <EditStrokeIcon color={editButtonHover ? '#1D4ED8' : '#6B7280'} />
                <span>Edit</span>
              </button>
            )}
          </div>
        ) : null}
      </div>
      <div
        style={{
          ...profileSectionStyles.content,
          ...(singleColumn ? profileSectionStyles.contentSingleColumn : {}),
        }}
      >
        {children}
      </div>
    </div>
  );
};

export default ProfileSection;
