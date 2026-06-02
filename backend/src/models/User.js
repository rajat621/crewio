import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      trim: true,
    },
    lastName: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
    },
    mobileNumber: {
      type: String,
    },
    countryCode: {
      type: String,
    },
    dateOfBirth: {
      type: String,
      trim: true,
    },
    gender: {
      type: String,
      trim: true,
    },
    avatar: {
      type: String,
    },
    otp: {
      type: String,
    },
    otpExpiry: {
      type: Date,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
    },
    role: {
      type: String,
      enum: ['owner', 'employee', 'admin'],
      default: 'employee',
    },
  },
  { timestamps: true }
);

const User = mongoose.model('User', userSchema);
export default User;
