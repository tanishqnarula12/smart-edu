import { Router } from 'express';
import * as controller from '../controllers/leaveController.js';
import { authenticateToken, requireRole, requireAnyRole, requirePermission } from '../middleware/auth.js';
import { validateBody, validateParams } from '../middleware/validate.js';
import { upload, uploadTo } from '../middleware/upload.js';
import { idParam } from '../validators/common.js';
import { leaveSchema, reviewLeaveSchema } from '../validators/engagementValidators.js';

const router = Router();
router.use(authenticateToken);

router.get('/', controller.listLeave);

router.post(
  '/',
  requireRole('student'),
  uploadTo('leave'),
  upload.single('attachment'),
  validateBody(leaveSchema),
  controller.applyForLeave
);

router.patch(
  '/:id/review',
  requireAnyRole('teacher', 'admin'),
  requirePermission('manage_leave'),
  validateParams(idParam),
  validateBody(reviewLeaveSchema),
  controller.reviewLeave
);

router.delete('/:id', requireRole('student'), validateParams(idParam), controller.cancelLeave);

export default router;
