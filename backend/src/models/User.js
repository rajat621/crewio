import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
<<<<<<< HEAD
      required: true,
      trim: true,
    },

=======
      trim: true,
    },
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
    lastName: {
      type: String,
      trim: true,
    },
<<<<<<< HEAD

=======
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      index: true,
    },

    passwordHash: {
      type: String,
      select: false,
    },

    password: {
      type: String,
      select: false,
    },

    role: {
      type: String,
      enum: ["OWNER", "owner"],
      default: "OWNER",
    },

    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
    },
<<<<<<< HEAD

    mobileNumber: String,

    countryCode: String,

    dateOfBirth: String,

    gender: String,

    avatar: String,

    isEmailVerified: {
      type: Boolean,
      default: false,
=======
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
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
    },

    isVerified: {
      type: Boolean,
      default: false,
    },

    onboardingCompleted: {
      type: Boolean,
      default: false,
    },

    otp: String,

    otpExpiresAt: Date,

    otpExpiry: Date,

    lastLoginAt: Date,
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("User", userSchema);

// import mongoose from 'mongoose';

// const userSchema = new mongoose.Schema(
//   {
//     firstName: {
//       type: String,
//       trim: true,
//     },
//     lastName: {
//       type: String,
//       trim: true,
//     },
//     email: {
//       type: String,
//       required: true,
//       unique: true,
//       lowercase: true,
//       trim: true,
//     },
//     password: {
//       type: String,
//       required: true,
//     },
//     mobileNumber: {
//       type: String,
//     },
//     countryCode: {
//       type: String,
//     },
//     dateOfBirth: {
//       type: String,
//       trim: true,
//     },
//     gender: {
//       type: String,
//       trim: true,
//     },
//     avatar: {
//       type: String,
//     },
//     otp: {
//       type: String,
//     },
//     otpExpiry: {
//       type: Date,
//     },
//     isVerified: {
//       type: Boolean,
//       default: false,
//     },
//     company: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: 'Company',
//     },
//     role: {
//       type: String,
//       enum: ['owner', 'employee', 'admin'],
//       default: 'owner',
//     },
//   },
//   { timestamps: true }
// );

// const User = mongoose.model('User', userSchema);
// export default User;
