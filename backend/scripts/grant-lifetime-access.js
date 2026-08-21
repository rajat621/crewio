#!/usr/bin/env node
// Manually grants (or revokes) lifetime access for a user. This is
// intentionally CLI-only — there is no API route or frontend UI that can set
// lifetimeAccess, by design (see subscriptions spec).
//
// Usage:
//   node scripts/grant-lifetime-access.js user@example.com          # grant
//   node scripts/grant-lifetime-access.js user@example.com --revoke # revoke
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config({ path: './.env' });

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI not set');
  process.exit(2);
}

const email = process.argv[2];
const revoke = process.argv.includes('--revoke');

if (!email) {
  console.error('Usage: node scripts/grant-lifetime-access.js <email> [--revoke]');
  process.exit(2);
}

async function run() {
  await mongoose.connect(MONGODB_URI, { dbName: process.env.MONGODB_DB || undefined });
  const User = mongoose.model('User', new mongoose.Schema({}, { strict: false, collection: 'users' }));

  const user = await User.findOne({ email: String(email).toLowerCase().trim() });
  if (!user) {
    console.log('USER_NOT_FOUND');
    process.exit(1);
  }

  user.lifetimeAccess = !revoke;
  await user.save();

  console.log(
    revoke
      ? `Revoked lifetime access for ${email}`
      : `Granted lifetime access for ${email}. They will skip Stripe/the subscription page entirely.`
  );
  process.exit(0);
}

run().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
