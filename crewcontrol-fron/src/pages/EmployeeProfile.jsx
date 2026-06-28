import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { EmployeeProfileHeader } from '../components/profile/EmployeeProfileHeader';
import { ProfileTabs } from '../components/profile/ProfileTabs';
import { EmployeeDetailsTab } from '../components/profile/tabs/EmployeeDetailsTab';
import { PassportDetailsTab } from '../components/profile/tabs/PassportDetailsTab';
import { EmployeeExpensesTab } from '../components/profile/tabs/EmployeeExpensesTab';
import { WorkDetailsTab } from '../components/profile/tabs/WorkDetailsTab';
import { AppAccessTab } from '../components/profile/tabs/AppAccessTab';
import { employeesApi } from '../api/employees';

const profilePageStyles = {
  container: {
    flex: 1,
    minHeight: '100vh',
    backgroundColor: '#F7F5FF',
    padding: '24px 40px',
  },
  pageCard: {
    backgroundColor: 'var(--bg-surface)',
    border: '1px solid var(--border-input)',
    borderRadius: '12px',
    padding: '24px',
  },
  title: {
    fontSize: '18px',
    letterSpacing: '0.54px',
    lineHeight: '20px',
    fontWeight: '600',
    color: 'var(--text-primary)',
    margin: '0 0 20px 0',
  },
  loading: {
    textAlign: 'center',
    padding: '48px 24px',
    fontSize: '16px',
    color: 'var(--text-secondary)',
  },
  error: {
    backgroundColor: 'var(--bg-error-soft)',
    border: '1px solid #FECACA',
    color: 'var(--color-error)',
    padding: '16px',
    borderRadius: '6px',
    marginBottom: '24px',
  },
};

const PROFILE_TABS = [
  { id: 'details', label: 'Employee Details' },
  { id: 'passport', label: 'Document’s' },
  { id: 'expenses', label: 'Employee Expenses' },
  { id: 'work', label: 'Work Details' },
  { id: 'appAccess', label: 'App Access' },
];

/**
 * EmployeeProfile - Main employee profile page with tabs
 * Route: /employees/:id
 */
const EmployeeProfile = () => {
  const { id } = useParams();
  const [activeTab, setActiveTab] = useState('details');
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchEmployee = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await employeesApi.getEmployee(id);
        setEmployee(response?.data?.employee || response?.data?.data || null);
      } catch (err) {
        setError(err.message || 'Failed to load employee profile');
        console.error('Error fetching employee:', err);
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchEmployee();
    }
  }, [id]);

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
  };

  const handleEditProfile = () => {};

  const handleAvatarChange = (avatar) => {
    setEmployee((prev) => (prev ? { ...prev, avatar } : prev));
  };

  const handleUpdateData = async (updatedData) => {
    try {
      const response = await employeesApi.updateEmployee(id, updatedData);
      const updatedEmployee = response?.data?.data || updatedData;
      setEmployee((prev) => ({ ...prev, ...updatedEmployee }));
      console.log('Employee updated successfully');
    } catch (err) {
      console.error('Error updating employee:', err);
    }
  };

  if (loading) {
    return (
      <div style={profilePageStyles.container}>
        <div style={profilePageStyles.loading}>Loading employee profile...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={profilePageStyles.container}>
        <div style={profilePageStyles.error}>Error: {error}</div>
      </div>
    );
  }

  if (!employee) {
    return (
      <div style={profilePageStyles.container}>
        <div style={profilePageStyles.error}>Employee not found</div>
      </div>
    );
  }

  return (
    <div style={profilePageStyles.container}>
      <div style={profilePageStyles.pageCard}>
        <h1 style={profilePageStyles.title}>Employee Profile</h1>
        <EmployeeProfileHeader
          employee={employee}
          onEdit={handleEditProfile}
          onAvatarChange={handleAvatarChange}
        />

        <ProfileTabs tabs={PROFILE_TABS} activeTabId={activeTab} onTabChange={handleTabChange} />

        {/* Tab Content */}
        {activeTab === 'details' && (
          <EmployeeDetailsTab employee={employee} onUpdate={handleUpdateData} />
        )}
        {activeTab === 'passport' && (
          <PassportDetailsTab employee={employee} onUpdate={handleUpdateData} />
        )}
        {activeTab === 'expenses' && (
          <EmployeeExpensesTab
            employee={employee}
            expenses={employee.expenses || {}}
            onUpdate={handleUpdateData}
          />
        )}
        {activeTab === 'work' && (
          <WorkDetailsTab employee={employee} onUpdate={handleUpdateData} />
        )}
        {activeTab === 'appAccess' && <AppAccessTab employee={employee} />}
      </div>
    </div>
  );
};

export default EmployeeProfile;

