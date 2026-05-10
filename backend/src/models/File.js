import mongoose from 'mongoose';

const fileSchema = new mongoose.Schema(
  {
    filename: String,
    mimetype: String,
    size: Number,
    path: String,
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

const File = mongoose.model('File', fileSchema);
export default File;
