import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { uploadFile } from '../controllers/upload.controller.js';

const router = express.Router();

const uploadRoot = path.resolve(process.cwd(), 'src', 'storage', 'uploads');
const allowedFolders = new Set(['timesheets', 'invoices', 'templates', 'signatures', 'stamps']);

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
		const ext = path.extname(file.originalname) || '';
		const safeBase = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9-_]/g, '_');
		cb(null, `${Date.now()}-${safeBase}${ext}`);
	},
});

const upload = multer({
	storage,
	limits: { fileSize: 10 * 1024 * 1024 },
});

router.post('/', upload.single('file'), uploadFile);

export default router;
