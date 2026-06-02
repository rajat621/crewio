import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { Attendance, Company, Employee } from '../src/models/index.js';

const resetRequested = process.argv.includes('--reset');

const companyBlueprints = [
  { name: 'Al Noor Facilities Management', legalName: 'Al Noor Facilities Management LLC', city: 'Dubai', countryCode: '+971', mobileNumber: '+971 50 410 1201', contactEmail: 'info@alnoorfm.example' },
  { name: 'Gulf Horizon Contracting', legalName: 'Gulf Horizon Contracting LLC', city: 'Abu Dhabi', countryCode: '+971', mobileNumber: '+971 50 410 1202', contactEmail: 'hello@gulfhorizon.example' },
  { name: 'Metro Build Services', legalName: 'Metro Build Services LLC', city: 'Sharjah', countryCode: '+971', mobileNumber: '+971 50 410 1203', contactEmail: 'contact@metrobuild.example' },
  { name: 'Prime Edge Maintenance', legalName: 'Prime Edge Maintenance LLC', city: 'Ajman', countryCode: '+971', mobileNumber: '+971 50 410 1204', contactEmail: 'support@primeedge.example' },
  { name: 'Desert Crest Contracting', legalName: 'Desert Crest Contracting LLC', city: 'Dubai', countryCode: '+971', mobileNumber: '+971 50 410 1205', contactEmail: 'team@desertcrest.example' },
  { name: 'Nexus Workforce Solutions', legalName: 'Nexus Workforce Solutions LLC', city: 'Ras Al Khaimah', countryCode: '+971', mobileNumber: '+971 50 410 1206', contactEmail: 'ops@nexusworkforce.example' },
  { name: 'Blue Pearl Technical Services', legalName: 'Blue Pearl Technical Services LLC', city: 'Fujairah', countryCode: '+971', mobileNumber: '+971 50 410 1207', contactEmail: 'admin@bluepearl.example' },
  { name: 'Summit Star Engineering', legalName: 'Summit Star Engineering LLC', city: 'Dubai', countryCode: '+971', mobileNumber: '+971 50 410 1208', contactEmail: 'info@summitstar.example' },
  { name: 'Urban Axis Projects', legalName: 'Urban Axis Projects LLC', city: 'Abu Dhabi', countryCode: '+971', mobileNumber: '+971 50 410 1209', contactEmail: 'projects@urbanaxis.example' },
  { name: 'Vertex Pro Build', legalName: 'Vertex Pro Build LLC', city: 'Sharjah', countryCode: '+971', mobileNumber: '+971 50 410 1210', contactEmail: 'sales@vertexpro.example' },
];

const employeeBlueprints = [
  { name: 'Aarav Sharma', firstName: 'Aarav', lastName: 'Sharma', gender: 'Male', nationality: 'Indian', trade: 'Electrician', position: 'Electrician', salary: 1800, ratePerHour: 12, overtimeRate: 18 },
  { name: 'Ramesh Thapa', firstName: 'Ramesh', lastName: 'Thapa', gender: 'Male', nationality: 'Nepali', trade: 'Mason', position: 'Mason', salary: 1750, ratePerHour: 11, overtimeRate: 16.5 },
  { name: 'Sanjay Yadav', firstName: 'Sanjay', lastName: 'Yadav', gender: 'Male', nationality: 'Indian', trade: 'Welder', position: 'Welder', salary: 1900, ratePerHour: 13, overtimeRate: 19.5 },
  { name: 'Vikram Singh', firstName: 'Vikram', lastName: 'Singh', gender: 'Male', nationality: 'Indian', trade: 'Plumber', position: 'Plumber', salary: 1850, ratePerHour: 12.5, overtimeRate: 18.75 },
  { name: 'Kiran BK', firstName: 'Kiran', lastName: 'BK', gender: 'Male', nationality: 'Nepali', trade: 'Helper', position: 'Helper', salary: 1400, ratePerHour: 9, overtimeRate: 13.5 },
  { name: 'Imran Khan', firstName: 'Imran', lastName: 'Khan', gender: 'Male', nationality: 'Pakistani', trade: 'Carpenter', position: 'Carpenter', salary: 1950, ratePerHour: 13.5, overtimeRate: 20.25 },
  { name: 'Faiz Ali', firstName: 'Faiz', lastName: 'Ali', gender: 'Male', nationality: 'Bangladeshi', trade: 'Painter', position: 'Painter', salary: 1600, ratePerHour: 10.5, overtimeRate: 15.75 },
  { name: 'Rahul Mehta', firstName: 'Rahul', lastName: 'Mehta', gender: 'Male', nationality: 'Indian', trade: 'Steel Fixer', position: 'Steel Fixer', salary: 2000, ratePerHour: 14, overtimeRate: 21 },
  { name: 'Naveen Kumar', firstName: 'Naveen', lastName: 'Kumar', gender: 'Male', nationality: 'Indian', trade: 'Driver', position: 'Driver', salary: 1700, ratePerHour: 11.5, overtimeRate: 17.25 },
  { name: 'Hassan Raza', firstName: 'Hassan', lastName: 'Raza', gender: 'Male', nationality: 'Pakistani', trade: 'Tile Mason', position: 'Tile Mason', salary: 1880, ratePerHour: 12.75, overtimeRate: 19.13 },
  { name: 'Arjun Patel', firstName: 'Arjun', lastName: 'Patel', gender: 'Male', nationality: 'Indian', trade: 'Electrician', position: 'Electrician', salary: 1825, ratePerHour: 12.2, overtimeRate: 18.3 },
  { name: 'Mohammad Saif', firstName: 'Mohammad', lastName: 'Saif', gender: 'Male', nationality: 'Bangladeshi', trade: 'Mason', position: 'Mason', salary: 1760, ratePerHour: 11.2, overtimeRate: 16.8 },
  { name: 'Suresh Rana', firstName: 'Suresh', lastName: 'Rana', gender: 'Male', nationality: 'Nepali', trade: 'Welder', position: 'Welder', salary: 1925, ratePerHour: 13.2, overtimeRate: 19.8 },
  { name: 'Bilal Ahmed', firstName: 'Bilal', lastName: 'Ahmed', gender: 'Male', nationality: 'Pakistani', trade: 'Plumber', position: 'Plumber', salary: 1840, ratePerHour: 12.3, overtimeRate: 18.45 },
  { name: 'Deepak Roy', firstName: 'Deepak', lastName: 'Roy', gender: 'Male', nationality: 'Indian', trade: 'Helper', position: 'Helper', salary: 1425, ratePerHour: 9.2, overtimeRate: 13.8 },
  { name: 'Farhan Malik', firstName: 'Farhan', lastName: 'Malik', gender: 'Male', nationality: 'Bangladeshi', trade: 'Carpenter', position: 'Carpenter', salary: 1980, ratePerHour: 13.7, overtimeRate: 20.55 },
  { name: 'Shyam Lal', firstName: 'Shyam', lastName: 'Lal', gender: 'Male', nationality: 'Indian', trade: 'Painter', position: 'Painter', salary: 1580, ratePerHour: 10.2, overtimeRate: 15.3 },
  { name: 'Usman Noor', firstName: 'Usman', lastName: 'Noor', gender: 'Male', nationality: 'Pakistani', trade: 'Steel Fixer', position: 'Steel Fixer', salary: 2010, ratePerHour: 14.2, overtimeRate: 21.3 },
  { name: 'Manoj Gurung', firstName: 'Manoj', lastName: 'Gurung', gender: 'Male', nationality: 'Nepali', trade: 'Driver', position: 'Driver', salary: 1720, ratePerHour: 11.7, overtimeRate: 17.55 },
  { name: 'Zubair Hussain', firstName: 'Zubair', lastName: 'Hussain', gender: 'Male', nationality: 'Bangladeshi', trade: 'Tile Mason', position: 'Tile Mason', salary: 1895, ratePerHour: 12.9, overtimeRate: 19.35 },
];

const attendanceDaysByMonth = [1, 2, 3, 4, 5, 8, 9, 10];
const attendanceStatuses = ['present', 'present', 'present', 'absent', 'leave', 'present', 'leave', 'absent'];
const passportStatuses = ['valid', 'expiring-soon', 'expired'];
const emirateStatuses = ['valid', 'expired', 'expiring-soon'];
const months = [
  { year: 2026, month: 3 },
  { year: 2026, month: 4 },
  { year: 2026, month: 5 },
];

const buildDate = (year, month, day) => new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

const getExpiryByStatus = (status, type) => {
  if (type === 'passport') {
    if (status === 'expired') return buildDate(2025, 11, 30);
    if (status === 'expiring-soon') return buildDate(2026, 7, 15);
    return buildDate(2027, 12, 31);
  }

  if (status === 'expired') return buildDate(2025, 10, 20);
  if (status === 'expiring-soon') return buildDate(2026, 8, 20);
  return buildDate(2027, 11, 30);
};

const getCheckInOut = (status, employeeIndex, dayIndex) => {
  if (status !== 'present') {
    return { checkIn: '', checkOut: '' };
  }

  const inHour = 8 + ((employeeIndex + dayIndex) % 2);
  const inMinute = (employeeIndex * 3 + dayIndex * 7) % 45;
  const outHour = 17 + ((employeeIndex + dayIndex) % 2);
  const outMinute = (employeeIndex * 5 + dayIndex * 2) % 45;

  const formatTime = (hour, minute) => {
    const suffix = hour >= 12 ? 'PM' : 'AM';
    const normalizedHour = ((hour + 11) % 12) + 1;
    return `${String(normalizedHour).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${suffix}`;
  };

  return {
    checkIn: formatTime(inHour, inMinute),
    checkOut: formatTime(outHour, outMinute),
  };
};

const seedCompanies = async () => {
  const companies = [];

  for (let index = 0; index < companyBlueprints.length; index += 1) {
    const blueprint = companyBlueprints[index];
    const company = await Company.findOneAndUpdate(
      { name: blueprint.name },
      {
        ...blueprint,
        companyLegalName: blueprint.legalName,
        companyRole: 'client',
        status: 'active',
        poBox: `PO Box ${10000 + index}`,
        faxNumber: `+971 4 410 12${String(index + 1).padStart(2, '0')}`,
        telephoneNumber: blueprint.mobileNumber,
        address: `${200 + index} Sheikh Zayed Road`,
        nationality: 'UAE',
        countryIso: 'AE',
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    companies.push(company);
  }

  return companies;
};

const seedEmployees = async (companies) => {
  const employees = [];
  const statusCounts = { valid: 0, 'expiring-soon': 0, expired: 0 };

  for (let index = 0; index < employeeBlueprints.length; index += 1) {
    const blueprint = employeeBlueprints[index];
    const company = companies[index % companies.length];
    const passportStatus = passportStatuses[index % passportStatuses.length];
    const emirateIdStatus = emirateStatuses[index % emirateStatuses.length];

    statusCounts[passportStatus] += 1;

    const employee = await Employee.findOneAndUpdate(
      { employeeId: `EMP${String(index + 1).padStart(4, '0')}` },
      {
        employeeId: `EMP${String(index + 1).padStart(4, '0')}`,
        ...blueprint,
        firstName: blueprint.firstName,
        lastName: blueprint.lastName,
        mobile: `+971 55 200 ${String(index + 11).padStart(4, '0')}`,
        mobileNumber: `+971 55 200 ${String(index + 11).padStart(4, '0')}`,
        phoneCountryIso: 'AE',
        countryCode: '+971',
        nationality: blueprint.nationality,
        state: 'Dubai',
        city: company.city,
        address: `${50 + index} ${company.city} Labour Camp`,
        salary: blueprint.salary,
        ratePerHour: blueprint.ratePerHour,
        overtimeRate: blueprint.overtimeRate,
        employmentType: 'full-time',
        joiningDate: buildDate(2023 + (index % 3), (index % 12) + 1, ((index * 2) % 24) + 1),
        joinDate: buildDate(2023 + (index % 3), (index % 12) + 1, ((index * 2) % 24) + 1),
        passportNo: `PA${String(200000 + index).slice(-6)}`,
        passportExpiry: getExpiryByStatus(passportStatus, 'passport'),
        passportStatus,
        emiratesId: `784-${String(1984 + index).slice(-4)}-${String(300000 + index).slice(-6)}-${index % 10}`,
        emiratesIdExpiry: getExpiryByStatus(emirateIdStatus, 'emirates'),
        emirateIdStatus,
        status: index % 19 === 0 ? 'inactive' : 'active',
        company: company._id,
        owner: company.owner || undefined,
        appUserId: `emp-${String(index + 1).padStart(4, '0')}`,
        appPassword: `emp-${String(index + 1).padStart(4, '0')}@123`,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    employees.push(employee);
  }

  return { employees, statusCounts };
};

const seedAttendance = async (employees, companies) => {
  const statusCounts = { present: 0, absent: 0, leave: 0 };

  for (let employeeIndex = 0; employeeIndex < employees.length; employeeIndex += 1) {
    const employee = employees[employeeIndex];
    const company = companies[employeeIndex % companies.length];

    for (let monthIndex = 0; monthIndex < months.length; monthIndex += 1) {
      const month = months[monthIndex];

      for (let dayIndex = 0; dayIndex < attendanceDaysByMonth.length; dayIndex += 1) {
        const day = attendanceDaysByMonth[dayIndex];
        const status = attendanceStatuses[(employeeIndex + monthIndex + dayIndex) % attendanceStatuses.length];
        const { checkIn, checkOut } = getCheckInOut(status, employeeIndex, dayIndex);

        statusCounts[status] += 1;

        await Attendance.updateOne(
          {
            employee: employee._id,
            company: company._id,
            userId: employee.appUserId,
            date: buildDate(month.year, month.month, day),
          },
          {
            employee: employee._id,
            company: company._id,
            userId: employee.appUserId,
            date: buildDate(month.year, month.month, day),
            checkIn,
            checkOut,
            status,
            remarks:
              status === 'present'
                ? 'Regular shift completed'
                : status === 'leave'
                  ? 'Approved leave'
                  : 'Absent for the day',
          },
          { upsert: true }
        );
      }
    }
  }

  return statusCounts;
};

const main = async () => {
  if (!env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not defined');
  }

  await mongoose.connect(env.MONGODB_URI);

  if (resetRequested) {
    await Promise.all([
      Attendance.deleteMany({}),
      Employee.deleteMany({}),
      Company.deleteMany({}),
    ]);
  }

  const companies = await seedCompanies();
  const { employees, statusCounts: documentStatusCounts } = await seedEmployees(companies);
  const attendanceStatusCounts = await seedAttendance(employees, companies);

  console.log('Dummy data seeded successfully');
  console.log(`Companies: ${companies.length}`);
  console.log(`Employees: ${employees.length}`);
  console.log(`Attendance records: ${employees.length * months.length * attendanceDaysByMonth.length}`);
  console.log(`Passport status mix: ${JSON.stringify(documentStatusCounts)}`);
  console.log(`Attendance mix: ${JSON.stringify(attendanceStatusCounts)}`);

  await mongoose.disconnect();
};

main().catch(async (error) => {
  console.error('Dummy data seed failed:', error.message);
  try {
    await mongoose.disconnect();
  } catch (_disconnectError) {
    // ignore disconnect failures
  }
  process.exit(1);
});