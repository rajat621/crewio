import express from 'express';
import multer from 'multer';
import path from 'path';
import { uploadFile } from '../controllers/upload.controller.js';
import authenticateToken from '../middleware/auth.middleware.js';
import { expensiveOperationLimiter } from '../middleware/rateLimiters.js';

const router = express.Router();

const allowedFolders = new Set(['timesheets', 'invoices', 'templates', 'signatures', 'stamps', 'employee-documents']);

// Only what this app actually needs to accept - blocks executables, scripts,
// and markup types (.html/.svg) that could be used for stored XSS if ever
// served back to a browser.
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
]);
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.pdf']);

// Employee documents (passport/Emirates ID/labour card/medical
// certificate/residence ID/contract copies) - stricter than the general
// upload rules above: PDF/JPG/JPEG/PNG only, capped at exactly 5 MB. Kept
// as its own set rather than tightening the shared one so timesheets/
// invoices/templates/signatures/stamps uploads are completely unaffected.
const EMPLOYEE_DOCUMENT_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'application/pdf']);
const EMPLOYEE_DOCUMENT_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.pdf']);
const EMPLOYEE_DOCUMENT_MAX_BYTES = 5 * 1024 * 1024;

// Files are held in memory only long enough to be handed to
// storage.service.js, which writes them to R2 (or local disk, if
// STORAGE_DRIVER isn't set to "r2" yet) under a company-scoped key.
// Nothing is ever written straight to disk here anymore.
const storage = multer.memoryStorage();

const buildUploadedFilename = (originalname) => {
	const ext = path.extname(originalname || '').toLowerCase().replace(/[^a-z0-9.]/g, '');
	const safeBase = path
		.basename(originalname || 'file', path.extname(originalname || ''))
		.replace(/[^a-zA-Z0-9-_]/g, '_');
	return `${Date.now()}-${safeBase}${ext}`;
};

const fileFilter = (req, file, cb) => {
	// Folder is resolved first so employee-documents can apply its own
	// (stricter) type whitelist below instead of the general one.
	const requested = String(req.body?.folder || req.query?.folder || 'timesheets').toLowerCase();
	req.uploadFolder = allowedFolders.has(requested) ? requested : 'timesheets';

	const ext = path.extname(file.originalname || '').toLowerCase();
	if (req.uploadFolder === 'employee-documents') {
		if (!EMPLOYEE_DOCUMENT_MIME_TYPES.has(file.mimetype) || !EMPLOYEE_DOCUMENT_EXTENSIONS.has(ext)) {
			return cb(new Error('Unsupported file type. Only PDF, JPG, JPEG and PNG are allowed.'));
		}
		return cb(null, true);
	}

	if (!ALLOWED_MIME_TYPES.has(file.mimetype) || !ALLOWED_EXTENSIONS.has(ext)) {
		return cb(new Error('Unsupported file type. Only JPG, PNG, WEBP, HEIC and PDF are allowed.'));
	}
	cb(null, true);
};

const upload = multer({
	storage,
	// The general 10MB ceiling stays as-is for existing folders; employee
	// documents get their own, stricter 5MB check below (multer's own
	// `limits.fileSize` is per-instance, not per-folder, so it can't enforce
	// two different ceilings on its own).
	limits: { fileSize: 10 * 1024 * 1024 },
	fileFilter,
});

const handleUpload = (req, res, next) => {
	upload.single('file')(req, res, (err) => {
		if (err) {
			const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
			return res.status(status).json({ message: err.message || 'Upload failed' });
		}
		if (req.file) {
			if (req.uploadFolder === 'employee-documents' && req.file.size > EMPLOYEE_DOCUMENT_MAX_BYTES) {
				return res.status(413).json({ message: 'File exceeds the 5MB limit for employee documents.' });
			}
			req.file.generatedFilename = buildUploadedFilename(req.file.originalname);
		}
		next();
	});
};

// Require authentication for uploads and attach tenant context
router.post('/', authenticateToken, expensiveOperationLimiter, handleUpload, uploadFile);

export default router;
