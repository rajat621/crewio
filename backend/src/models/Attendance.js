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
    status: {
      type: String,
      enum: ['present', 'absent', 'leave', 'half-day'],
      default: 'absent',
    },
    remarks: {
      type: String,
    },
  },
  { timestamps: true }
);

const Attendance = mongoose.model('Attendance', attendanceSchema);
export default Attendance;
