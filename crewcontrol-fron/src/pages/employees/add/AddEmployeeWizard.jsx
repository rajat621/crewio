import { useState } from 'react';
import {
  Box,
  Button,
  Stepper,
  Step,
  StepLabel,
  Typography,
  Container,
  Card,
  Grid,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  CircularProgress
} from '@mui/material';
import {
  CheckCircleOutline as CheckCircleIcon,
  FileCopy as CopyIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Add as AddIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { employeesApi } from '../../../api/employees';
import { getCountries } from '../../../utils/locationService';

const steps = [
  'Personal Details',
  'Passport Details',
  'Employee Expenses',
  'Work Details',
  'App Access',
  'Success'
];

const expenseFields = [
  { group: 'Recruitment & Legal', fields: ['recruitment', 'offerLetter', 'stampingFee'] },
  { group: 'Insurance & Medical', fields: ['emiratesId', 'medical', 'insurance', 'medicalInsurance'] },
  { group: 'Labor & Advance', fields: ['laborPayment', 'laborPaymentCategory2', 'laborAdvance', 'laborPRE'] },
  { group: 'Other', fields: ['icn', 'emigrationCancellation', 'fineStamping', 'workersCompensation', 'laborWPS', 'otherExpenses', 'entryPermit'] }
];

const trades = ['Carpenter', 'Steel Fixer', 'Tile Mason', 'Plumber', 'Electrician', 'Painter'];
const employmentTypes = ['full-time', 'contract', 'daily'];
const nationalities = getCountries();

export default function AddEmployeeWizard() {
  const navigate = useNavigate();
  const [activeStep, setActiveStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [generatedCredentials, setGeneratedCredentials] = useState(null);

  // Form data
  const [formData, setFormData] = useState({
    // Step 1: Personal Details
    firstName: '',
    lastName: '',
    gender: '',
    dateOfBirth: '',
    mobile: '',
    email: '',
    nationality: '',
    address: '',

    // Step 2: Passport Details
    passportNo: '',
    passportExpiry: '',

    // Step 3: Expenses
    expenses: {
      recruitment: 0,
      offerLetter: 0,
      entryPermit: 0,
      stampingFee: 0,
      emiratesId: 0,
      fineStamping: 0,
      icn: 0,
      emigrationCancellation: 0,
      medical: 0,
      insurance: 0,
      medicalInsurance: 0,
      workersCompensation: 0,
      laborPayment: 0,
      laborPaymentCategory2: 0,
      laborAdvance: 0,
      laborPRE: 0,
      laborWPS: 0,
      otherExpenses: 0
    },

    // Step 4: Work Details
    trade: '',
    joiningDate: '',
    ratePerHour: 0,
    employmentType: 'full-time',
    overtimeRate: 0
  });

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleExpenseChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      expenses: {
        ...prev.expenses,
        [field]: parseFloat(value) || 0
      }
    }));
  };

  const validateStep = () => {
    if (activeStep === 0) {
      if (!formData.firstName || !formData.lastName || !formData.mobile || !formData.email) {
        setError('Please fill in all required fields');
        return false;
      }
    }
    if (activeStep === 3) {
      if (!formData.trade || !formData.joiningDate || !formData.ratePerHour) {
        setError('Please fill in all required fields');
        return false;
      }
    }
    setError(null);
    return true;
  };

  const handleNext = () => {
    if (validateStep()) {
      setActiveStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    setActiveStep(prev => prev - 1);
    setError(null);
  };

  const handleSubmit = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await employeesApi.createEmployee(formData);
      
      setGeneratedCredentials({
        userId: response.data.employee.userId || response.data.employee.employeeId,
        appPassword: response.data.employee.appPassword,
        email: response.data.employee.email
      });

      // Move to step 5 (App Access display)
      setActiveStep(4);
      setLoading(false);

      // Then automatically go to success
      setTimeout(() => {
        setActiveStep(5);
      }, 2000);
    } catch (err) {
      console.error('Error creating employee:', err);
      setError(err.response?.data?.message || 'Failed to create employee');
      setLoading(false);
    }
  };

  const handleViewProfile = () => {
    if (generatedCredentials?.employeeId) {
      navigate(`/employees/${generatedCredentials.employeeId}`);
    }
  };

  const handleAddAnother = () => {
    // Reset form and start over
    setActiveStep(0);
    setFormData({
      firstName: '',
      lastName: '',
      gender: '',
      dateOfBirth: '',
      mobile: '',
      email: '',
      nationality: '',
      address: '',
      passportNo: '',
      passportExpiry: '',
      expenses: Object.fromEntries(
        expenseFields.flatMap(g => g.fields).map(f => [f, 0])
      ),
      trade: '',
      joiningDate: '',
      ratePerHour: 0,
      employmentType: 'full-time',
      overtimeRate: 0
    });
    setGeneratedCredentials(null);
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Card sx={{ p: 3 }}>
        {/* Header */}
        <Typography variant="h5" fontWeight={600} sx={{ mb: 3 }}>
          Add New Employee
        </Typography>

        {/* Stepper */}
        <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
          {steps.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {/* Error Alert */}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* Step 1: Personal Details */}
        {activeStep === 0 && (
          <Box>
            <Typography variant="h6" sx={{ mb: 2 }}>
              Personal Information
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  label="First Name *"
                  name="firstName"
                  value={formData.firstName}
                  onChange={handleInputChange}
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  label="Last Name *"
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleInputChange}
                />
              </Grid>
              <Grid item xs={6}>
                <FormControl fullWidth>
                  <InputLabel>Gender</InputLabel>
                  <Select
                    name="gender"
                    value={formData.gender}
                    onChange={handleInputChange}
                    label="Gender"
                  >
                    <MenuItem value="Male">Male</MenuItem>
                    <MenuItem value="Female">Female</MenuItem>
                    <MenuItem value="Other">Other</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  label="Date of Birth"
                  name="dateOfBirth"
                  type="date"
                  value={formData.dateOfBirth}
                  onChange={handleInputChange}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  label="Mobile *"
                  name="mobile"
                  value={formData.mobile}
                  onChange={handleInputChange}
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  label="Email *"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleInputChange}
                />
              </Grid>
              <Grid item xs={6}>
                <FormControl fullWidth>
                  <InputLabel>Nationality</InputLabel>
                  <Select
                    name="nationality"
                    value={formData.nationality}
                    onChange={handleInputChange}
                    label="Nationality"
                  >
                    {nationalities.map(country => (
                      <MenuItem key={country.isoCode} value={country.isoCode}>{country.name}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  label="Address"
                  name="address"
                  value={formData.address}
                  onChange={handleInputChange}
                  multiline
                  rows={2}
                />
              </Grid>
            </Grid>
          </Box>
        )}

        {/* Step 2: Passport Details */}
        {activeStep === 1 && (
          <Box>
            <Typography variant="h6" sx={{ mb: 2 }}>
              Passport Information
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  label="Passport Number"
                  name="passportNo"
                  value={formData.passportNo}
                  onChange={handleInputChange}
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  label="Passport Expiry Date"
                  name="passportExpiry"
                  type="date"
                  value={formData.passportExpiry}
                  onChange={handleInputChange}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
            </Grid>
          </Box>
        )}

        {/* Step 3: Expenses */}
        {activeStep === 2 && (
          <Box>
            <Typography variant="h6" sx={{ mb: 2 }}>
              Employee Expenses (AED)
            </Typography>
            {expenseFields.map(group => (
              <Box key={group.group} sx={{ mb: 3 }}>
                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                  {group.group}
                </Typography>
                <Grid container spacing={2}>
                  {group.fields.map(field => (
                    <Grid item xs={6} key={field}>
                      <TextField
                        fullWidth
                        label={field.charAt(0).toUpperCase() + field.slice(1).replace(/([A-Z])/g, ' $1')}
                        type="number"
                        value={formData.expenses[field]}
                        onChange={(e) => handleExpenseChange(field, e.target.value)}
                        inputProps={{ step: '0.01', min: '0' }}
                      />
                    </Grid>
                  ))}
                </Grid>
              </Box>
            ))}
          </Box>
        )}

        {/* Step 4: Work Details */}
        {activeStep === 3 && (
          <Box>
            <Typography variant="h6" sx={{ mb: 2 }}>
              Work Information
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <FormControl fullWidth>
                  <InputLabel>Trade *</InputLabel>
                  <Select
                    name="trade"
                    value={formData.trade}
                    onChange={handleInputChange}
                    label="Trade"
                  >
                    {trades.map(trade => (
                      <MenuItem key={trade} value={trade}>{trade}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  label="Joining Date *"
                  name="joiningDate"
                  type="date"
                  value={formData.joiningDate}
                  onChange={handleInputChange}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  label="Rate per Hour (AED) *"
                  name="ratePerHour"
                  type="number"
                  value={formData.ratePerHour}
                  onChange={handleInputChange}
                  inputProps={{ step: '0.01', min: '0' }}
                />
              </Grid>
              <Grid item xs={6}>
                <FormControl fullWidth>
                  <InputLabel>Employment Type</InputLabel>
                  <Select
                    name="employmentType"
                    value={formData.employmentType}
                    onChange={handleInputChange}
                    label="Employment Type"
                  >
                    {employmentTypes.map(type => (
                      <MenuItem key={type} value={type}>{type}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  label="Overtime Rate (AED)"
                  name="overtimeRate"
                  type="number"
                  value={formData.overtimeRate}
                  onChange={handleInputChange}
                  inputProps={{ step: '0.01', min: '0' }}
                />
              </Grid>
            </Grid>
          </Box>
        )}

        {/* Step 5: App Access (Read-only display) */}
        {activeStep === 4 && generatedCredentials && (
          <Box sx={{ textAlign: 'center' }}>
            <CheckCircleIcon sx={{ fontSize: 60, color: 'success.main', mb: 2 }} />
            <Typography variant="h6" sx={{ mb: 2 }}>
              Employee Created Successfully!
            </Typography>
            <Typography variant="body2" color="textSecondary" sx={{ mb: 3 }}>
              Share these credentials with the employee for mobile app access
            </Typography>

            <Card sx={{ p: 3, bgcolor: '#F5F5F5', mb: 2 }}>
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" color="textSecondary" sx={{ mb: 1 }}>
                  User ID
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="h6" sx={{ fontFamily: 'monospace', flex: 1 }}>
                    {generatedCredentials.userId}
                  </Typography>
                  <IconButton
                    size="small"
                    onClick={() => copyToClipboard(generatedCredentials.userId)}
                  >
                    <CopyIcon />
                  </IconButton>
                </Box>
              </Box>

              <Box>
                <Typography variant="body2" color="textSecondary" sx={{ mb: 1 }}>
                  App Password
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="h6" sx={{ fontFamily: 'monospace', flex: 1 }}>
                    {generatedCredentials.appPassword}
                  </Typography>
                  <IconButton
                    size="small"
                    onClick={() => copyToClipboard(generatedCredentials.appPassword)}
                  >
                    <CopyIcon />
                  </IconButton>
                </Box>
              </Box>
            </Card>
          </Box>
        )}

        {/* Step 6: Success */}
        {activeStep === 5 && (
          <Box sx={{ textAlign: 'center' }}>
            <CheckCircleIcon sx={{ fontSize: 80, color: 'success.main', mb: 2 }} />
            <Typography variant="h5" fontWeight={600} sx={{ mb: 1 }}>
              Employee Added Successfully!
            </Typography>
            <Typography variant="body2" color="textSecondary" sx={{ mb: 3 }}>
              The new employee has been added to the system.
            </Typography>
          </Box>
        )}

        {/* Navigation Buttons */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 4 }}>
          <Button
            disabled={activeStep === 0 || loading}
            onClick={handleBack}
          >
            Back
          </Button>

          <Box sx={{ display: 'flex', gap: 1 }}>
            {activeStep < 3 && (
              <Button
                variant="contained"
                onClick={handleNext}
                disabled={loading}
              >
                Next
              </Button>
            )}
            {activeStep === 3 && (
              <Button
                variant="contained"
                onClick={handleSubmit}
                disabled={loading}
              >
                {loading ? <CircularProgress size={24} /> : 'Submit'}
              </Button>
            )}
            {activeStep === 5 && (
              <>
                <Button
                  variant="outlined"
                  onClick={handleAddAnother}
                >
                  Add Another Employee
                </Button>
                <Button
                  variant="contained"
                  onClick={handleViewProfile}
                >
                  View Profile
                </Button>
              </>
            )}
          </Box>
        </Box>
      </Card>
    </Container>
  );
}
