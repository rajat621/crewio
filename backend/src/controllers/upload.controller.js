import FileRecord from '../models/FileRecord.js';
import { serverError } from '../utils/apiResponse.js';
import User from '../models/User.js';
import Company from '../models/Company.js';
import { saveBuffer, deleteObject } from '../services/storage.service.js';

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
    const filename = req.file.generatedFilename || req.file.originalname;

    // Determine ownerId and companyId from req.user - this is what actually
    // scopes the file to this tenant. Never trust anything from the request
    // body for this; it always comes from the verified JWT.
    const ownerId = authUser.ownerId || authUser.userId;
    const companyId = authUser.companyId || null;

    const saved = await saveBuffer({
      companyId,
      ownerId,
      folder,
      filename,
      buffer: req.file.buffer,
      mimetype: req.file.mimetype,
    });

    // Create a FileRecord for tracking and access control
    let fileRec;
    try {
      fileRec = await FileRecord.create({
        ownerId,
        companyId,
        uploadedBy: authUser.userId,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        path: saved.path,
        storageDriver: saved.driver,
        storageKey: saved.key,
        purpose: req.body?.purpose || req.query?.purpose || folder,
      });
    } catch (createError) {
      // Best-effort cleanup so a FileRecord failure (validation error,
      // transient DB issue) doesn't leave the just-uploaded object
      // orphaned in storage indefinitely. Never let a cleanup failure
      // here mask the original, more important error below.
      try {
        await deleteObject({ key: saved.key, driver: saved.driver });
      } catch (cleanupError) {
        console.error('Failed to clean up orphaned upload after FileRecord creation failure:', cleanupError.message);
      }
      throw createError;
    }

    res.status(201).json({
      message: 'File uploaded successfully',
      fileId: String(fileRec._id),
      path: saved.path,
      filePath: saved.path,
      // Spec-shaped fields (additive - existing consumers like the invoice
      // timesheet upload only ever read `path`/`filePath`/`data`, above,
      // and are unaffected by these). `fileUrl` is the existing
      // authenticated, driver-agnostic file-streaming endpoint
      // (GET /api/files/:id) rather than a raw storage key, since raw R2
      // keys aren't directly browser-fetchable the way a local `/uploads`
      // path would be - this reuses the same abstraction files.controller.js
      // already provides instead of inventing a second one.
      success: true,
      fileName: req.file.originalname,
      fileUrl: `/api/files/${String(fileRec._id)}`,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      data: {
        id: String(fileRec._id),
        filename,
        originalName: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        path: saved.path,
      },
    });
  } catch (error) {
      console.error("========== R2 Upload Error ==========");
      console.error(error);
      console.error(error.stack);
    return serverError(res, 'Upload failed');
  }
};


