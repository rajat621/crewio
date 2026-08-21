import express from 'express';
import {
	getEmployees,
	getEmployeeStats,
	getEmployeeAttendancePage,
	getEmployee,
	createEmployee,
	updateEmployee,
	deleteEmployee,
	assignEmployee,
	unassignEmployee,
	reactivateEmployee,
	getEmployeeAttendance,
	addEmployeeDocument,
	listEmployeeDocuments,
} from '../controllers/employee.controller.js';
import authenticateToken from '../middleware/auth.middleware.js';
import { requireActiveSubscription } from '../middleware/subscription.middleware.js';

const router = express.Router();

router.use(authenticateToken);
router.use(requireActiveSubscription);

router.get('/', getEmployees);
// Must come before /:id or Express would treat "stats" as an employee id.
router.get('/stats', getEmployeeStats);
router.get('/attendance-page', getEmployeeAttendancePage);
router.post('/', createEmployee);
router.get('/:id', getEmployee);
router.put('/:id', updateEmployee);
router.delete('/:id', deleteEmployee);
router.post('/:id/assign', assignEmployee);
router.post('/:id/unassign', unassignEmployee);
router.post('/:id/reactivate', reactivateEmployee);
router.get('/:id/attendance', getEmployeeAttendance);
router.post('/:id/documents', addEmployeeDocument);
router.get('/:id/documents', listEmployeeDocuments);

export default router;


