import React, { useState } from 'react';

const profileTabsStyles = {
  container: {
    display: 'flex',
    // borderBottom: '1px solid var(--border-input)',
    gap: '24px',
    marginBottom: '16px',
    overflowX: 'auto',
  },
  tab: {
    padding: '11px 0',
    margin: '0',
    fontSize: '14px',
    fontWeight: '400',
    letterSpacing: '0.14px',
    lineHeight: '20px ',
    color: 'var(--text-secondary)',
    backgroundColor: 'transparent',
    border: 'none',
    borderBottom: '2px solid transparent',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    whiteSpace: 'nowrap',
    outline: 'none',
    boxShadow: 'none',
    appearance: 'none',
  },
  tabHover: {
    color: 'var(--color-primary)',
  borderBottom: '2px solid transparent', // force clean
  },
  tabActive: {
  color: 'var(--color-primary)',
  borderBottom: '2px solid var(--color-primary)',
  },
};

/**
 * ProfileTabs - Reusable tab navigation component
 * @param {Array} tabs - Array of tab objects: { id, label }
 * @param {string} activeTabId - Currently active tab ID
 * @param {Function} onTabChange - Callback when tab changes
 */
export const ProfileTabs = ({ tabs, activeTabId, onTabChange }) => {
  const [hoveredTabId, setHoveredTabId] = useState(null);

  return (
    <div style={profileTabsStyles.container}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={activeTabId === tab.id ? 'active' : ''}
          onClick={() => onTabChange(tab.id)}
          onMouseEnter={() => setHoveredTabId(tab.id)}
          onMouseLeave={() => setHoveredTabId(null)}
          style={{
            ...profileTabsStyles.tab,
            ...(hoveredTabId === tab.id && activeTabId !== tab.id ? profileTabsStyles.tabHover : {}),
            ...(activeTabId === tab.id ? profileTabsStyles.tabActive : {}),
          }}
          onFocus={(event) => {
            event.currentTarget.style.borderBottomColor = 'transparent';
          }}
          onBlur={(event) => {
            event.currentTarget.style.borderBottomColor = activeTabId === tab.id ? 'var(--color-primary)' : 'transparent';
          }}
          onMouseDown={(event) => {
            event.currentTarget.style.borderBottomColor = 'transparent';
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
};

export default ProfileTabs;

