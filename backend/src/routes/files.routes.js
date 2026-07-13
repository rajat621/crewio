import express from 'express';
import authenticateToken from '../middleware/auth.middleware.js';
import authenticateEmployee from '../middleware/employeeAuth.middleware.js';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { getFileById } from '../controllers/files.controller.js';
import User from '../models/User.js';
import Employee from '../models/Employee.js';

const router = express.Router();

const findEmployeeFromToken = async (tokenPayload = {}) => {
	const identifiers = [
		tokenPayload.employeeId,
		tokenPayload.empId,
		tokenPayload.appUserId,
		tokenPayload.userId,
	].filter(Boolean);

	for (const identifier of identifiers) {
		const employee = await Employee.findOne({
			$or: [
				{ _id: identifier },
				{ employeeId: identifier },
				{ appUserId: identifier },
			],
		}).select('-appPassword');
		if (employee) return employee;
	}

	return null;
};

// Use token-dispatch middleware: if token is an employee token, use employee auth,
// otherwise use the normal authenticateToken middleware.
router.get('/:id', async (req, res, next) => {
	const authHeader = req.headers['authorization'];
	const token = authHeader && authHeader.split(' ')[1];
	if (!token) return res.status(401).json({ message: 'No token provided' });

	// Try to fast-decode to detect employee tokens
	const decodedFast = jwt.decode(token) || {};
	try {
		if (decodedFast && (decodedFast.role === 'employee' || decodedFast.employeeId || decodedFast.appUserId || decodedFast.empId)) {
			// verify and load employee
			let verified;
			try { verified = jwt.verify(token, env.JWT_SECRET); } catch (e) { return res.status(403).json({ message: 'Invalid or expired token' }); }
			if (verified.role !== 'employee') return res.status(403).json({ message: 'Access denied: not an employee token' });
			const emp = await findEmployeeFromToken(verified);
			if (!emp) return res.status(401).json({ message: 'Employee not found' });
			req.employee = emp;
			return getFileById(req, res, next);
		}

		// Otherwise treat as owner/admin token
		let verified;
		try { verified = jwt.verify(token, env.JWT_SECRET); } catch (e) { return res.status(403).json({ message: 'Invalid or expired token' }); }
		const dbUser = await User.findById(verified.userId).populate('company');
		if (!dbUser) {
			// fallback: if token contains employeeId, try employee
			const emp = await findEmployeeFromToken(verified);
			if (emp) {
				req.employee = emp; return getFileById(req, res, next);
			}
			if (verified.employeeId) {
				const emp = await Employee.findById(verified.employeeId).select('-appPassword');
				if (!emp) return res.status(401).json({ message: 'User not found' });
				req.employee = emp; return getFileById(req, res, next);
			}
			return res.status(401).json({ message: 'User not found' });
		}

		const companyId = dbUser.company?._id || null;
		const ownerId = dbUser.role === 'owner' ? dbUser._id : (dbUser.company?.owner || null);
		req.user = { userId: String(dbUser._id), email: dbUser.email, role: dbUser.role, companyId: companyId ? String(companyId) : null, ownerId: ownerId ? String(ownerId) : null };
		req.currentUser = dbUser;
		return getFileById(req, res, next);
	} catch (err) {
		return res.status(500).json({ message: 'Auth error', error: err.message });
	}
});

export default router;


