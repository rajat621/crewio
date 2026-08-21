import path from 'path';
import { serverError } from '../utils/apiResponse.js';
import FileRecord from '../models/FileRecord.js';
import AuditLog from '../models/AuditLog.js';
import EmployeeDocument from '../models/EmployeeDocument.js';
import { objectExists, streamObject, driverFromStoredPath } from '../services/storage.service.js';

export const getFileById = async (req, res) => {
  try {
    const { id } = req.params;
    const auth = req.user || null;
    const emp = req.employee || null;
    if (!auth && !emp) return res.status(401).json({ message: 'Not authenticated' });

    const file = await FileRecord.findById(id).lean();
    if (!file) return res.status(404).json({ message: 'File not found' });

    // If request from employee mobile token, ensure file is attached to that employee
    let requesterOwner = null;
    let requesterUserId = null;
    let requesterCompanyId = null;
    if (emp) {
      // check link table EmployeeDocument to ensure this employee owns the file
      const link = await EmployeeDocument.findOne({ fileRecord: file._id, employee: emp._id });
      if (!link) return res.status(403).json({ message: 'Access denied to file' });
      requesterOwner = emp.ownerId || emp.owner || null;
      requesterUserId = String(emp._id);
      requesterCompanyId = emp.company || null;
    } else {
      // admin/owner style auth
      requesterOwner = auth.ownerId || auth.userId;
      requesterUserId = auth.userId;
      requesterCompanyId = auth.companyId || null;
      if (String(file.ownerId) !== String(requesterOwner) && String(file.companyId) !== String(requesterCompanyId)) {
        return res.status(403).json({ message: 'Access denied to file' });
      }
    }

    // Append audit log - identical for both drivers
    const writeAuditLog = async () => {
      try {
        await AuditLog.create({
          user: requesterUserId,
          ownerId: requesterOwner,
          action: 'DOWNLOAD_FILE',
          entity: 'FileRecord',
          entityId: file._id,
          company: file.companyId || null,
          changes: { path: file.path, filename: file.originalName },
        });
      } catch (e) {
        // non-fatal
        console.error('Failed to write audit log for file download', e.message);
      }
    };

    // storageDriver/storageKey are authoritative when present. Older records
    // created before the R2 migration only have `path`, so fall back to
    // inferring the driver from its shape (local paths start with '/').
    const driver = file.storageDriver || driverFromStoredPath(file.path);
    const key = file.storageKey || file.path;

    const exists = await objectExists({ key, driver });
    if (!exists) return res.status(404).json({ message: 'File not found in storage' });

    await writeAuditLog();

    const inline = req.query.inline === '1' || req.query.inline === 'true';
    // D19.7 finding (low severity, defense-in-depth): `file.originalName`
    // is the client-declared filename from upload time (multer's
    // `file.originalname`), stored verbatim. Node's http module already
    // rejects raw CR/LF in header values (throws, so classic header-
    // splitting/injection isn't reachable), but an unescaped `"` in the
    // filename can still break out of the quoted `filename="..."` value
    // and produce a malformed header. Stripped here the same way
    // `buildUploadedFilename` (upload.routes.js) and `buildTenantKey`
    // (storage.service.js) already sanitize filenames elsewhere in the
    // upload/download path - consistent with the existing pattern, not a
    // new one.
    const rawFilename = file.originalName || path.basename(file.path || key || 'file');
    const filename = String(rawFilename).replace(/["\r\n]/g, '_');
    const disposition = `${inline ? 'inline' : 'attachment'}; filename="${filename}"`;

    try {
      await streamObject({
        key,
        driver,
        res,
        contentType: file.mimeType || 'application/octet-stream',
        disposition,
      });
    } catch (streamError) {
      if (!res.headersSent) {
        return serverError(res, 'Failed to stream file');
      } else {
        res.end();
      }
    }
  } catch (error) {
    return serverError(res, 'Failed to fetch file');
  }
};

export default { getFileById };
