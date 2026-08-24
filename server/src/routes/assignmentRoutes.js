import { Router } from 'express';
import * as controller from '../controllers/assignmentController.js';
import { authenticateToken, requireRole, requireAnyRole, requirePermission } from '../middleware/auth.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.js';
import { upload, uploadTo } from '../middleware/upload.js';
import { idParam } from '../validators/common.js';
import {
  assignmentSchema,
  updateAssignmentSchema,
  submitAssignmentSchema,
  assignmentQuerySchema,
} from '../validators/academicValidators.js';

const router = Router();
router.use(authenticateToken);

router.get('/', validateQuery(assignmentQuerySchema), controller.listAssignments);
router.get('/stats', requireAnyRole('teacher', 'admin'), controller.getStats);
router.get('/:id', validateParams(idParam), controller.getAssignment);

// ── Teacher / admin ───────────────────────────────────────────────────────
router.post(
  '/',
  requireAnyRole('teacher', 'admin'),
  requirePermission('manage_assignments'),
  uploadTo('assignments'),
  upload.single('attachment'),
  validateBody(assignmentSchema),
  controller.createAssignment
);

router.patch(
  '/:id',
  requireAnyRole('teacher', 'admin'),
  requirePermission('manage_assignments'),
  validateParams(idParam),
  uploadTo('assignments'),
  upload.single('attachment'),
  validateBody(updateAssignmentSchema),
  controller.updateAssignment
);

router.delete(
  '/:id',
  requireAnyRole('teacher', 'admin'),
  requirePermission('manage_assignments'),
  validateParams(idParam),
  controller.deleteAssignment
);

router.get(
  '/:id/submissions',
  requireAnyRole('teacher', 'admin'),
  validateParams(idParam),
  controller.getSubmissions
);

// ── Student ───────────────────────────────────────────────────────────────
router.post(
  '/:id/submit',
  requireRole('student'),
  validateParams(idParam),
  uploadTo('submissions'),
  upload.single('file'),
  validateBody(submitAssignmentSchema),
  controller.submitAssignment
);

export default router;
