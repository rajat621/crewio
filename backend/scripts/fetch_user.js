#!/usr/bin/env node
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config({ path: './.env' });

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI not set');
  process.exit(2);
}

const email = process.argv[2];
if (!email) {
  console.error('Usage: node fetch_user.js <email>');
  process.exit(2);
}

async function run() {
  try {
    await mongoose.connect(MONGODB_URI, { dbName: process.env.MONGODB_DB || undefined, });
    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false, collection: 'users' }));
    const u = await User.findOne({ email }).lean();
    if (!u) {
      console.log('USER_NOT_FOUND');
    } else {
      console.log(JSON.stringify(u, null, 2));
    }
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
