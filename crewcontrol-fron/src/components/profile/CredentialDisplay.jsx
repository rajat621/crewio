import React from 'react';

const credentialDisplayStyles = {
  container: {
    maxWidth: '540px',
    margin: '0',
    backgroundColor: '#F9FAFB',
    border: '1px solid #DEDEDE',
    borderRadius: '8px',
    padding: '24px 20px',
  },
  heading: {
    fontSize: '18px',
    fontWeight: '500',
    color: '#141414',
    lineHeight:'28px',
    textAlign: 'center',
    margin: '0 0 16px 0',
  },
  credentialBlock: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
  },
  iconWrap: {
    width: '52px',
    height: '52px',
    borderRadius: '50%',
    backgroundColor: '#111827',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#FFFFFF',
    flexShrink: 0,
  },
  icon: {
    width: '30px',
    height: '30px',
  },
  credentialContent: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  credentialLabel: {
    fontSize: '16px',
    color: '#808080',
    fontWeight: '400',
  },
  credentialValue: {
    fontSize: '20px',
    fontWeight: '600',
    color: '#141414',
    letterSpacing: '0.4px',
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    margin: '16px 0',
  },
  dividerLine: {
    height: '1px',
    backgroundColor: '#DEDEDE',
    flex: 1,
  },
  dividerText: {
    fontSize: '12px',
    color: '#808080',
    fontWeight: '400',
  },
};

const IdStrokeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={credentialDisplayStyles.icon} aria-hidden="true">
    <rect x="3" y="4" width="18" height="16" rx="2" ry="2" />
    <circle cx="9" cy="10" r="2" />
    <path d="M15 9h3" />
    <path d="M15 13h3" />
    <path d="M7 16c1.2-1.1 2.8-1.1 4 0" />
  </svg>
);

const LockStrokeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={credentialDisplayStyles.icon} aria-hidden="true">
    <rect x="3" y="11" width="18" height="10" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

/**
 * CredentialDisplay - Display app credentials (Login ID and Password)
 * @param {Object} credentials - { loginId, password }
 */
export const CredentialDisplay = ({ credentials = {} }) => {
  const { loginId, password } = credentials;

  return (
    <div style={credentialDisplayStyles.container}>
      <h3 style={credentialDisplayStyles.heading}>Login ID and Password Generated</h3>

      <div style={credentialDisplayStyles.credentialBlock}>
        <div style={credentialDisplayStyles.iconWrap}>
          <IdStrokeIcon />
        </div>
        <div style={credentialDisplayStyles.credentialContent}>
          <span style={credentialDisplayStyles.credentialLabel}>Login ID</span>
          <span style={credentialDisplayStyles.credentialValue}>{loginId || '—'}</span>
        </div>
      </div>

      <div style={credentialDisplayStyles.divider}>
        <span style={credentialDisplayStyles.dividerLine} />
        <span style={credentialDisplayStyles.dividerText}>AND</span>
        <span style={credentialDisplayStyles.dividerLine} />
      </div>

      <div style={credentialDisplayStyles.credentialBlock}>
        <div style={credentialDisplayStyles.iconWrap}>
          <LockStrokeIcon />
        </div>
        <div style={credentialDisplayStyles.credentialContent}>
          <span style={credentialDisplayStyles.credentialLabel}>Password</span>
          <span style={credentialDisplayStyles.credentialValue}>{password || '—'}</span>
        </div>
      </div>
    </div>
  );
};

export default CredentialDisplay;
