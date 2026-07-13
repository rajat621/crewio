#!/usr/bin/env node
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config({ path: './.env' });

const email = process.argv[2];
if (!email) {
  console.error('Usage: node fetch_user_and_company.js <email>');
  process.exit(2);
}

const run = async () => {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI not set');
    process.exit(2);
  }
  await mongoose.connect(process.env.MONGODB_URI);
  const User = mongoose.model('User', new mongoose.Schema({}, { strict: false, collection: 'users' }));
  const Company = mongoose.model('Company', new mongoose.Schema({}, { strict: false, collection: 'companies' }));

  const user = await User.findOne({ email: String(email).toLowerCase().trim() }).lean();
  console.log('USER:');
  console.log(user ? JSON.stringify(user, null, 2) : 'NOT FOUND');

  if (user) {
    const companies = await Company.find({ $or: [ { ownerId: user._id }, { createdBy: user._id }, { owner: user._id } ] }).lean();
    console.log('COMPANIES:');
    console.log(JSON.stringify(companies, null, 2));
  }

  await mongoose.disconnect();
};

run().catch(err => { console.error(err); process.exit(1); });
