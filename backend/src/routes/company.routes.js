import express from 'express';
import { 
  getCompanies,
  getCompany,
  createCompany, 
  updateOwnerCompany, 
  getOwnerCompany,
  updateCompany,
  createClientCompany,
  deleteCompany,
  getClientCompanies,
} from '../controllers/company.controller.js';
import authenticateToken from '../middleware/auth.middleware.js';

const router = express.Router();

router.get('/', getCompanies);
router.post('/', createCompany);
router.get('/clients', getClientCompanies);
router.post('/clients', createClientCompany);
router.post('/client', createClientCompany);
router.get('/owner/me', authenticateToken, getOwnerCompany);
router.put('/owner/me', authenticateToken, updateOwnerCompany);
router.get('/:id', getCompany);
router.put('/:id', authenticateToken, updateCompany);
router.delete('/:id', authenticateToken, deleteCompany);

export default router;
