import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { User, Company, Employee, Attendance } from '../src/models/index.js';

const email = process.argv[2] || process.env.SEED_OWNER_EMAIL || 'owner@example.com';

const main = async () => {
  if (!env.MONGODB_URI) throw new Error('MONGODB_URI not set in env');
  await mongoose.connect(env.MONGODB_URI);

  const user = await User.findOne({ email });
  if (!user) {
    console.error('User not found for email', email);
    await mongoose.disconnect();
    process.exit(1);
  }

  // find a client company to map
  const clientCompany = await Company.findOne({ companyRole: 'client' });
  if (!clientCompany) {
    console.error('No client company found to map');
    await mongoose.disconnect();
    process.exit(1);
  }

  // update the company owner fields
  clientCompany.owner = user._id;
  clientCompany.ownerId = user._id;
  clientCompany.createdBy = user._id;
  await clientCompany.save();
  console.log('Mapped company', clientCompany._id.toString(), 'to user', user.email);

  // update user's company reference
  user.company = clientCompany._id;
  await user.save();
  console.log('Updated user.company to', clientCompany._id.toString());

  // map employees of that company to user
  const empRes = await Employee.updateMany({ company: clientCompany._id }, { owner: user._id, ownerId: user._id });
  console.log('Updated employees count:', empRes.modifiedCount || empRes.nModified || empRes.modifiedCount);

  // map attendance for that company
  const attRes = await Attendance.updateMany({ company: clientCompany._id }, { ownerId: user._id });
  console.log('Updated attendance count:', attRes.modifiedCount || attRes.nModified || attRes.modifiedCount);

  await mongoose.disconnect();
  console.log('Mapping complete');
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
