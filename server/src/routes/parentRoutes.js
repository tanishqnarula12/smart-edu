import { Router } from 'express';
import * as controller from '../controllers/parentController.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

// Every route here is parent-only; privacy scoping happens inside the handlers.
const router = Router();
router.use(authenticateToken, requireRole('parent'));

router.get('/children', controller.listChildren);
router.get('/dashboard', controller.getDashboard);
router.get('/children/:studentId/:section', controller.getChildSection);

export default router;
