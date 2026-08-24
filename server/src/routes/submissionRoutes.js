import { Router } from 'express';
import * as controller from '../controllers/assignmentController.js';
import { authenticateToken, requireAnyRole, requirePermission } from '../middleware/auth.js';
import { validateBody, validateParams } from '../middleware/validate.js';
import { idParam } from '../validators/common.js';
import { gradeSubmissionSchema } from '../validators/academicValidators.js';

const router = Router();
router.use(authenticateToken);

router.post(
  '/:id/grade',
  requireAnyRole('teacher', 'admin'),
  requirePermission('manage_assignments'),
  validateParams(idParam),
  validateBody(gradeSubmissionSchema),
  controller.gradeSubmission
);

export default router;
