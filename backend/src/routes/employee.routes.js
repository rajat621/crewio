import express from 'express';
import {
	getEmployees,
	getEmployee,
	createEmployee,
	updateEmployee,
	deleteEmployee,
	assignEmployee,
	getEmployeeAttendance,
} from '../controllers/employee.controller.js';

const router = express.Router();

router.get('/', getEmployees);
router.post('/', createEmployee);
router.get('/:id', getEmployee);
router.put('/:id', updateEmployee);
router.delete('/:id', deleteEmployee);
router.post('/:id/assign', assignEmployee);
router.get('/:id/attendance', getEmployeeAttendance);

export default router;
