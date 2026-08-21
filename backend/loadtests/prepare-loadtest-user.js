import mongoose from 'mongoose';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import User from '../src/models/User.js';

dotenv.config();

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI is not set');
  process.exit(1);
}

const email = process.env.TEST_USER_EMAIL || 'loadtest@example.com';
const password = process.env.TEST_USER_PASSWORD || 'LoadTest123!';

async function main() {
  await mongoose.connect(uri, { dbName: 'crewcontrol' });
  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user) {
    console.error(`User not found: ${email}`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  user.passwordHash = passwordHash;
  user.password = undefined;
  user.isEmailVerified = true;
  await user.save();

  console.log('updated user:', {
    email: user.email,
    _id: String(user._id),
    ownerId: String(user._id),
    companyId: String(user.company || ''),
    isEmailVerified: user.isEmailVerified,
    passwordHash: !!user.passwordHash,
  });

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
