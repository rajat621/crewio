import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { User, Company, Employee, Attendance } from '../src/models/index.js';

const EMAIL = process.argv[2] || process.env.SEED_OWNER_EMAIL || 'rajatraj.mca24@rvce.edu.in';
const NUM_EMPLOYEES = Number(process.argv[3] || 5);

const buildDate = (year, month, day) => new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

const months = [
  { year: 2026, month: 6 },
  { year: 2026, month: 7 },
];

const statuses = ['present', 'present', 'present', 'absent', 'leave'];

const randomStatus = (i, d) => statuses[(i + d) % statuses.length];

const getCheckInOut = (status, i, d) => {
  if (status !== 'present') return { checkIn: '', checkOut: '' };
  const inHour = 8 + ((i + d) % 2);
  const inMinute = (i * 3 + d * 7) % 45;
  const outHour = 17 + ((i + d) % 2);
  const outMinute = (i * 5 + d * 2) % 45;
  const format = (h, m) => {
    const suffix = h >= 12 ? 'PM' : 'AM';
    const nh = ((h + 11) % 12) + 1;
    return `${String(nh).padStart(2,'0')}:${String(m).padStart(2,'0')} ${suffix}`;
  };
  return { checkIn: format(inHour, inMinute), checkOut: format(outHour, outMinute) };
};

const main = async () => {
  if (!env.MONGODB_URI) throw new Error('MONGODB_URI not set');
  await mongoose.connect(env.MONGODB_URI);

  const user = await User.findOne({ email: EMAIL });
  if (!user) {
    console.error('User not found:', EMAIL);
    await mongoose.disconnect();
    process.exit(1);
  }

  if (!user.company) {
    console.error('User has no company set. Map a company first.');
    await mongoose.disconnect();
    process.exit(1);
  }

  const company = await Company.findById(user.company);
  if (!company) {
    console.error('Company not found:', user.company);
    await mongoose.disconnect();
    process.exit(1);
  }

  const created = [];
  for (let i = 0; i < NUM_EMPLOYEES; i++) {
    const idx = Date.now() % 10000 + i;
    const empId = `EMP_CUSTOM_${String(idx).padStart(4, '0')}`;
    const appUserId = `cust-${String(idx).padStart(4, '0')}`;
    const name = `ExtraWorker ${i + 1}`;

    const emp = await Employee.findOneAndUpdate(
      { employeeId: empId },
      {
        employeeId: empId,
        name,
        firstName: name.split(' ')[0],
        lastName: name.split(' ')[1] || '',
        appUserId,
        appPassword: `${appUserId}@123`,
        company: company._id,
        owner: user._id,
        ownerId: user._id,
        status: 'active',
        nationality: 'Indian',
        city: company.city || 'Dubai',
        address: `${10 + i} ${company.city || 'Labour Camp'}`,
        trade: 'General Labour',
        mobile: `+971500000${String(i).padStart(2, '0')}`,
        joinDate: new Date(Date.UTC(2026, 0, 1)),
        joiningDate: new Date(Date.UTC(2026, 0, 1)),
        ratePerHour: 20 + i,
        employmentType: 'full-time',
        passportNo: `P${String(idx).padStart(6, '0')}`,
        passportExpiry: new Date(Date.UTC(2030, 0, 1)),
        
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    created.push(emp);
  }

  let attendanceCount = 0;
  for (let ei = 0; ei < created.length; ei++) {
    const emp = created[ei];
    for (const m of months) {
      const daysInMonth = 28; // keep consistent
      for (let d = 1; d <= daysInMonth; d++) {
        const status = randomStatus(ei, d);
        const { checkIn, checkOut } = getCheckInOut(status, ei, d);
        await Attendance.updateOne(
          { employee: emp._id, company: company._id, date: buildDate(m.year, m.month, d) },
          {
            employee: emp._id,
            company: company._id,
            ownerId: user._id,
            userId: emp.appUserId,
            date: buildDate(m.year, m.month, d),
            checkIn,
            checkOut,
            status,
            remarks: status === 'present' ? 'Auto seeded present' : status === 'leave' ? 'Auto seeded leave' : 'Auto seeded absent',
          },
          { upsert: true }
        );
        attendanceCount += 1;
      }
    }
  }

  console.log(`Created ${created.length} employees and ${attendanceCount} attendance records for company ${company._id}`);
  await mongoose.disconnect();
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
