import FileRecord from '../models/FileRecord.js';
import User from '../models/User.js';
import Company from '../models/Company.js';

export const uploadFile = async (req, res) => {
  try {
    // Ensure authentication middleware populated req.user
    const authUser = req.user;
    if (!authUser || !authUser.userId) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const folder = req.uploadFolder || 'timesheets';
    const relativePath = `/uploads/${folder}/${req.file.filename}`;

    // Determine ownerId and companyId from req.user
    const ownerId = authUser.ownerId || authUser.userId;
    const companyId = authUser.companyId || null;

    // Create a FileRecord for tracking and access control
    const fileRec = await FileRecord.create({
      ownerId,
      companyId,
      uploadedBy: authUser.userId,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      path: relativePath,
      purpose: req.body?.purpose || req.query?.purpose || folder,
    });

    res.status(201).json({
      message: 'File uploaded successfully',
      fileId: String(fileRec._id),
      path: relativePath,
      filePath: relativePath,
      data: {
        id: String(fileRec._id),
        filename: req.file.filename,
        originalName: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        path: relativePath,
      },
    });
  } catch (error) {
    res.status(500).json({ message: 'Upload failed', error: error.message });
  }
};


