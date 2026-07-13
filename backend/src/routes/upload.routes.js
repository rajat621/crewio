import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { uploadFile } from '../controllers/upload.controller.js';
import authenticateToken from '../middleware/auth.middleware.js';

const router = express.Router();

const uploadRoot = path.resolve(process.cwd(), 'src', 'storage', 'uploads');
const allowedFolders = new Set(['timesheets', 'invoices', 'templates', 'signatures', 'stamps']);

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

for (const folder of allowedFolders) {
	const dir = path.join(uploadRoot, folder);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
}

const storage = multer.diskStorage({
	destination: (req, _file, cb) => {
		const requested = String(req.body?.folder || req.query?.folder || 'timesheets').toLowerCase();
		const folder = allowedFolders.has(requested) ? requested : 'timesheets';
		req.uploadFolder = folder;
		cb(null, path.join(uploadRoot, folder));
	},
	filename: (_req, file, cb) => {
		const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '');
		const safeBase = path.basename(file.originalname, path.extname(file.originalname)).replace(/[^a-zA-Z0-9-_]/g, '_');
		cb(null, `${Date.now()}-${safeBase}${ext}`);
	},
});

const fileFilter = (_req, file, cb) => {
	const ext = path.extname(file.originalname || '').toLowerCase();
	if (!ALLOWED_MIME_TYPES.has(file.mimetype) || !ALLOWED_EXTENSIONS.has(ext)) {
		return cb(new Error('Unsupported file type. Only JPG, PNG, WEBP, HEIC and PDF are allowed.'));
	}
	cb(null, true);
};

const upload = multer({
	storage,
	limits: { fileSize: 10 * 1024 * 1024 },
	fileFilter,
});

const handleUpload = (req, res, next) => {
	upload.single('file')(req, res, (err) => {
		if (err) {
			return res.status(400).json({ message: err.message || 'Upload failed' });
		}
		next();
	});
};

// Require authentication for uploads and attach tenant context
router.post('/', authenticateToken, handleUpload, uploadFile);

export default router;
