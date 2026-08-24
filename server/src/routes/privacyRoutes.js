import { Router } from 'express';
import * as controller from '../controllers/privacyController.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { privacySchema } from '../validators/engagementValidators.js';

// Privacy settings belong to the student, so the whole router is student-only.
const router = Router();
router.use(authenticateToken, requireRole('student'));

router.get('/', controller.getPrivacySettings);
router.patch('/', validateBody(privacySchema), controller.updatePrivacySettings);
router.delete('/parents/:parentId', controller.unlinkParent);

export default router;
