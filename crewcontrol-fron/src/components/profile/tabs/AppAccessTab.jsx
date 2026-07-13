import React from 'react';
import { ProfileSection } from '../ProfileSection';
import { CredentialDisplay } from '../CredentialDisplay';

/**
 * AppAccessTab - Display employee mobile app credentials
 * @param {Object} employee - Employee data with appUserId and appPassword
 */
export const AppAccessTab = ({ employee = {} }) => {
  const credentials = {
    loginId: employee.appUserId || employee.userId || '—',
    password: employee.appPassword || '—',
  };

  return (
    <ProfileSection title="App Access" showEdit={false}>
      <div style={{ gridColumn: '1 / -1', maxWidth: '580px' }}>
        <CredentialDisplay credentials={credentials} />
      </div>
    </ProfileSection>
  );
};

export default AppAccessTab;
