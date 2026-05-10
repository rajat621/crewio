import React, { useEffect, useState } from 'react';
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
  firstName: employee.firstName || '',
  lastName: employee.lastName || '',
  gender: employee.gender || '',
  dateOfBirth: toInputDate(employee.dateOfBirth),
  mobile: employee.mobile || employee.mobileNumber || '',
  email: employee.email || '',
  nationality: employee.nationality || '',
  state: employee.state || '',
  city: employee.city || '',
  address: employee.address || '',
});

/**
 * EmployeeDetailsTab - Display and edit employee personal information
 * @param {Object} employee - Employee data
 * @param {Function} onUpdate - Callback for updates
 */
export const EmployeeDetailsTab = ({ employee = {}, onUpdate = () => {} }) => {
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

  return (
    <ProfileSection
      title="Employee Information"
      showEdit={true}
      isEditing={isEditing}
      onEdit={() => setIsEditing(true)}
      onCancel={handleCancel}
      onSave={handleSave}
      singleColumn={true}
    >
      <div style={{ maxWidth: '580px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <ProfileField
            label="Employee ID"
            value={employee.employeeId}
            isEditing={false}
          />
        </div>
        <ProfileField
          label="First Name"
          value={formData.firstName}
          isEditing={isEditing}
          onChange={(value) => handleFieldChange('firstName', value)}
        />
        <ProfileField
          label="Last Name"
          value={formData.lastName}
          isEditing={isEditing}
          onChange={(value) => handleFieldChange('lastName', value)}
        />
        <ProfileField
          label="Gender"
          value={formData.gender}
          isEditing={isEditing}
          type="select"
          options={[
            { value: 'Male', label: 'Male' },
            { value: 'Female', label: 'Female' },
            { value: 'Other', label: 'Other' },
          ]}
          onChange={(value) => handleFieldChange('gender', value)}
        />
        <ProfileField
          label="Date of Birth"
          value={formData.dateOfBirth}
          isEditing={isEditing}
          type="date"
          onChange={(value) => handleFieldChange('dateOfBirth', value)}
        />
        <div style={{ gridColumn: '1 / -1' }}>
          <ProfileField
            label="Mobile Number"
            value={formData.mobile}
            isEditing={isEditing}
            type="tel"
            onChange={(value) => handleFieldChange('mobile', value)}
          />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <ProfileField
            label="Email"
            value={formData.email}
            isEditing={isEditing}
            type="email"
            onChange={(value) => handleFieldChange('email', value)}
          />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <ProfileField
            label="Nationality"
            value={formData.nationality}
            isEditing={isEditing}
            onChange={(value) => handleFieldChange('nationality', value)}
          />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <ProfileField
            label="State"
            value={formData.state}
            isEditing={isEditing}
            onChange={(value) => handleFieldChange('state', value)}
          />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <ProfileField
            label="City"
            value={formData.city}
            isEditing={isEditing}
            onChange={(value) => handleFieldChange('city', value)}
          />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <ProfileField
            label="Address"
            value={formData.address}
            isEditing={isEditing}
            onChange={(value) => handleFieldChange('address', value)}
          />
        </div>
      </div>
    </ProfileSection>
  );
};

export default EmployeeDetailsTab;
