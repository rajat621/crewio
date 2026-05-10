import React, { useRef, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';


const actionMenuStyles = {
  container: {
    position: 'relative',
  },
  button: {
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: '6px 8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s ease',
    color: '#6B7280',
    outline: 'none',
    boxShadow: 'none',
    borderRadius: '0',
    WebkitAppearance: 'none',
    appearance: 'none',
  },
  buttonHover: {
    color: '#111827',
    outline: 'none',
    boxShadow: 'none',
  },
  popup: {
    position: 'fixed',
    backgroundColor: '#FFFFFF',
    border: '1px solid #E5E7EB',
    borderRadius: '8px',
    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15)',
    minWidth: '200px',
    zIndex: '9999',
    overflow: 'hidden',
  },
  menuItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 16px',
    fontSize: '14px',
    color: '#111827',
    backgroundColor: '#FFFFFF',
    border: 'none',
    cursor: 'pointer',
    width: '100%',
    textAlign: 'left',
    transition: 'all 0.2s ease',
  },
  menuItemHover: {
    backgroundColor: '#F9FAFB',
    color: '#2C5FEA',
  },
  menuItemDanger: {
    color: '#DC2626',
  },
  menuItemDangerHover: {
    backgroundColor: '#FEE2E2',
    color: '#991B1B',
  },
};

/**
 * ThreeDotIcon - SVG icon for the three-dot menu button
 */
const ThreeDotIcon = ({ color = '#6B7280', size = 20 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ color }}
  >
    <circle cx="12" cy="5" r="1" />
    <circle cx="12" cy="12" r="1" />
    <circle cx="12" cy="19" r="1" />
  </svg>
);

/**
 * EmployeeActionMenu - 3-dot menu with actions
 * @param {Array} actions - Array of action objects: { id, label, onClick, isDanger }
 * @param {string} employeeId - Employee ID for context
 */
export const EmployeeActionMenu = ({ actions = [], employeeId }) => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [buttonHover, setButtonHover] = useState(false);
  const [hoveredItemId, setHoveredItemId] = useState(null);
  const [popupPosition, setPopupPosition] = useState({ top: 0, left: 0 });
  const containerRef = useRef(null);
  const buttonRef = useRef(null);

  const defaultActions = [
  {
    id: 'view',
    label: 'View Profile',
    icon: <VisibilityOutlinedIcon fontSize="small" />,
    onClick: () => navigate(`/employees/${employeeId}`),
  },
  {
    id: 'edit',
    label: 'Edit',
    icon: <EditOutlinedIcon fontSize="small" />,
    onClick: () => navigate(`/employees/${employeeId}?edit=true`),
  },
  {
    id: 'assign',
    label: 'Assign',
    icon: <AssignmentOutlinedIcon fontSize="small" />,
    onClick: () => console.log('Assign to', employeeId),
  },
  {
    id: 'invoice',
    label: 'Generate Invoice',
    icon: <DescriptionOutlinedIcon fontSize="small" />,
    onClick: () => navigate(`/tax-invoices/generate?employeeId=${employeeId}`),
  },
  {
    id: 'delete',
    label: 'Delete',
    icon: <DeleteOutlineOutlinedIcon fontSize="small" />,
    onClick: () => console.log('Delete', employeeId),
    isDanger: true,
  },
];

  const menuActions = actions.length > 0 ? actions : defaultActions;

  useEffect(() => {
    if (!isOpen || !buttonRef.current) return;

    const buttonRect = buttonRef.current.getBoundingClientRect();
    const menuHeight = menuActions.length * 48; // Approximate height per item

    // Calculate position: try to open below, if no space, open above
    let top = buttonRect.bottom + 8;
    let left = buttonRect.right - 200; // Align with right edge

    // Check if menu would go off-screen bottom
    if (top + menuHeight > window.innerHeight - 20) {
      top = buttonRect.top - menuHeight - 8;
    }

    // Check if menu would go off-screen left
    if (left < 10) {
      left = 10;
    }

    // Check if menu would go off-screen right
    if (left + 200 > window.innerWidth - 10) {
      left = window.innerWidth - 210;
    }

    setPopupPosition({ top, left });
  }, [isOpen, menuActions.length]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const handleActionClick = (action) => {
    action.onClick?.();
    setIsOpen(false);
    setHoveredItemId(null);
  };

  return (
    <div style={actionMenuStyles.container} ref={containerRef}>
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        onMouseEnter={() => setButtonHover(true)}
        onMouseLeave={() => setButtonHover(false)}
        onMouseDown={(event) => event.currentTarget.blur()}
        onBlur={() => setButtonHover(false)}
        style={{
          ...actionMenuStyles.button,
          ...(buttonHover ? actionMenuStyles.buttonHover : {}),
        }}
        aria-label="Employee actions"
        title="Employee actions"
      >
        <ThreeDotIcon color={buttonHover ? '#111827' : '#6B7280'} size={20} />
      </button>

      {isOpen && (
        <div
          style={{
            ...actionMenuStyles.popup,
            top: `${popupPosition.top}px`,
            left: `${popupPosition.left}px`,
          }}
        >
          {menuActions.map((action) => (
            <button
              key={action.id}
              onClick={() => handleActionClick(action)}
              onMouseEnter={() => setHoveredItemId(action.id)}
              onMouseLeave={() => setHoveredItemId(null)}
              style={{
                ...actionMenuStyles.menuItem,
                ...(action.isDanger ? actionMenuStyles.menuItemDanger : {}),
                ...(hoveredItemId === action.id
                  ? action.isDanger
                    ? actionMenuStyles.menuItemDangerHover
                    : actionMenuStyles.menuItemHover
                  : {}),
              }}
            >
                {action.icon && <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '18px', height: '18px' }}>{action.icon}</span>}
                <span>{action.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default EmployeeActionMenu;
