import { Router } from 'express';
import * as controller from '../controllers/searchController.js';
import { authenticateToken } from '../middleware/auth.js';
import { validateQuery } from '../middleware/validate.js';
import { searchQuerySchema } from '../validators/adminValidators.js';

const router = Router();
router.use(authenticateToken);

router.get('/', validateQuery(searchQuerySchema), controller.globalSearch);

export default router;
