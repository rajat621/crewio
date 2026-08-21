import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../src/models/User.js';
import Employee from '../src/models/Employee.js';

dotenv.config({ path: './.env' });

const MONGO = process.env.MONGO_URI || 'mongodb://localhost:27017/crew_control';

async function run() {
  await mongoose.connect(MONGO, { useNewUrlParser: true, useUnifiedTopology: true });
  // find first owner user
  const user = await User.findOne({ email: /rajat/i }) || await User.findOne();
  if (!user) {
    console.error('No user found');
    process.exit(1);
  }

  const payload = {
    name: 'Auto Test Employee',
    firstName: 'Auto',
    lastName: 'Employee',
    employeeId: `AUTO${Date.now().toString().slice(-6)}`,
    mobileNumber: '500000002',
    owner: user._id,
    ownerId: user._id,
    company: user.company || null,
  };

  const emp = await Employee.create(payload);
  console.log('Created employee', emp._id.toString());
  await mongoose.disconnect();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
