import express from 'express';
import mongoose from 'mongoose';
import { serverError } from '../utils/apiResponse.js';
import authenticateToken from '../middleware/auth.middleware.js';
import authenticateEmployee from '../middleware/employeeAuth.middleware.js';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { getFileById } from '../controllers/files.controller.js';
import User from '../models/User.js';
import Employee from '../models/Employee.js';

const router = express.Router();

// D19.8 finding (MEDIUM, real): the original version of this helper ran a
// single `Employee.findOne({$or: [{_id: identifier}, {employeeId:
// identifier}, {appUserId: identifier}]})` for each candidate identifier.
// `_id` is globally unique (a real Mongo ObjectId, cryptographically
// verified as this employee's own identity once the token signature is
// checked), but `employeeId` is only unique *per owner* (see the
// `unique_employeeId_owner` compound index on Employee.js - two different
// tenants can legitimately have an employee with the same business
// employeeId string) and `appUserId` has no uniqueness constraint at all.
// Both are owner-settable free text at employee-creation time
// (createEmployee/updateEmployee). Combining a globally-unique field and
// two non-globally-unique, attacker-settable fields in one `$or` is
// non-deterministic when more than one document could satisfy different
// arms of the OR: a malicious owner who sets one of their own employees'
// `employeeId`/`appUserId` field to a string that happens to match a
// *different* tenant's employee's real `_id` could - depending on which
// document MongoDB's query planner returns first for that particular
// combination - cause `req.employee` to resolve to the wrong tenant's
// employee for a request presenting a validly-signed token for a
// completely different employee. Fixed by checking the authoritative,
// globally-unique `_id` first, deterministically and in isolation, before
// ever falling back to the business-field OR-lookup (which itself remains
// scoped to a single value at a time, same as before, for the fields that
// legitimately need it).
const findEmployeeFromToken = async (tokenPayload = {}) => {
	const idCandidates = [tokenPayload.employeeId, tokenPayload.userId].filter(Boolean);
	for (const candidate of idCandidates) {
		if (mongoose.Types.ObjectId.isValid(candidate)) {
			const employee = await Employee.findById(candidate).select('-appPassword');
			if (employee) return employee;
		}
	}

	const identifiers = [
		tokenPayload.employeeId,
		tokenPayload.empId,
		tokenPayload.appUserId,
		tokenPayload.userId,
	].filter(Boolean);

	for (const identifier of identifiers) {
		const employee = await Employee.findOne({
			$or: [
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
			try { verified = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] }); } catch (e) { return res.status(403).json({ message: 'Invalid or expired token' }); }
			if (verified.role !== 'employee') return res.status(403).json({ message: 'Access denied: not an employee token' });
			const emp = await findEmployeeFromToken(verified);
			if (!emp) return res.status(401).json({ message: 'Employee not found' });
			req.employee = emp;
			return getFileById(req, res, next);
		}

		// Otherwise treat as owner/admin token
		let verified;
		try { verified = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] }); } catch (e) { return res.status(403).json({ message: 'Invalid or expired token' }); }
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
		return serverError(res, 'Auth error');
	}
});

export default router;


