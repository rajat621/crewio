import express from 'express';
import {
	getEmployees,
	getEmployee,
	createEmployee,
	updateEmployee,
	deleteEmployee,
	assignEmployee,
	unassignEmployee,
	getEmployeeAttendance,
	addEmployeeDocument,
	listEmployeeDocuments,
} from '../controllers/employee.controller.js';
import authenticateToken from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(authenticateToken);

router.get('/', getEmployees);
router.post('/', createEmployee);
router.get('/:id', getEmployee);
router.put('/:id', updateEmployee);
router.delete('/:id', deleteEmployee);
router.post('/:id/assign', assignEmployee);
router.post('/:id/unassign', unassignEmployee);
router.get('/:id/attendance', getEmployeeAttendance);
router.post('/:id/documents', addEmployeeDocument);
router.get('/:id/documents', listEmployeeDocuments);

export default router;
