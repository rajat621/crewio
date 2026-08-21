
import mongoose from 'mongoose';

const attendanceSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      index: true,
    },
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    date: {
      type: Date,
      required: true,
    },
    checkIn: {
      type: String,
    },
    checkOut: {
      type: String,
    },
    hoursWorked: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['present', 'absent', 'leave', 'half-day'],
      default: 'absent',
    },
    remarks: {
      type: String,
    },
    workSession: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WorkSession',
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

const Attendance = mongoose.model('Attendance', attendanceSchema);

// The two query shapes actually used throughout the codebase are
// {ownerId, date range} sorted by date (dashboard/summary lists -
// attendance.controller.js) and {employee, date range} (the mobile
// check-in/checkout flow - mobileAttendance/mobileLifecycle controllers,
// hit on nearly every attendance action). Neither was covered by the
// single-field indexes above, so both fell back to filtering/sorting a
// larger-than-necessary result set in memory once the collection grows.
attendanceSchema.index({ ownerId: 1, date: -1 });
attendanceSchema.index({ employee: 1, date: -1 });

export default Attendance;