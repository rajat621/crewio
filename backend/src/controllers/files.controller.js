import fs from 'fs';
import path from 'path';
import FileRecord from '../models/FileRecord.js';
import AuditLog from '../models/AuditLog.js';
import EmployeeDocument from '../models/EmployeeDocument.js';

const storageRoot = path.resolve(process.cwd(), 'src', 'storage');

const toAbsoluteStoragePath = (inputPath) => {
  if (!inputPath || typeof inputPath !== 'string') return null;
  const normalized = inputPath.trim();
  if (normalized.startsWith('data:')) return null;
  if (normalized.startsWith('/')) {
    return path.join(storageRoot, normalized.replace(/^\//, ''));
  }
  if (path.isAbsolute(normalized)) {
    // disallow arbitrary absolute paths
    return null;
  }
  return path.join(storageRoot, normalized.replace(/^\.\//, '').replace(/^src\/storage\//, ''));
};

export const getFileById = async (req, res) => {
  try {
    console.log("REQ.USER", req.user);
    console.log("REQ.EMPLOYEE", req.employee);
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

    const abs = toAbsoluteStoragePath(file.path);
    if (!abs || !fs.existsSync(abs)) return res.status(404).json({ message: 'File not found on disk' });

    // Append audit log
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

    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
    const inline = req.query.inline === '1' || req.query.inline === 'true';
    if (inline) {
      res.setHeader('Content-Disposition', `inline; filename="${file.originalName || path.basename(file.path)}"`);
    } else {
      res.setHeader('Content-Disposition', `attachment; filename="${file.originalName || path.basename(file.path)}"`);
    }

    const stream = fs.createReadStream(abs);
    stream.on('error', () => res.status(500).end());
    stream.pipe(res);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch file', error: error.message });
  }
};

export default { getFileById };
