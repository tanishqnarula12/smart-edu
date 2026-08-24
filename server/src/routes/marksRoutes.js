import { Router } from 'express';
import * as controller from '../controllers/marksController.js';
import { authenticateToken, requireAnyRole, requirePermission } from '../middleware/auth.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.js';
import { idParam } from '../validators/common.js';
import {
  assessmentSchema,
  enterMarksSchema,
  marksQuerySchema,
} from '../validators/academicValidators.js';

const router = Router();
router.use(authenticateToken);

// ── Reads ─────────────────────────────────────────────────────────────────
router.get('/', validateQuery(marksQuerySchema), controller.listMarks);
router.get('/performance', controller.getPerformance);
router.get('/assessments', controller.listAssessments);

// ── Teacher / admin ───────────────────────────────────────────────────────
router.get('/declining', requireAnyRole('teacher', 'admin'), controller.getDeclining);
router.get('/class/:classId', requireAnyRole('teacher', 'admin'), controller.getClassPerformance);

router.post(
  '/assessments',
  requireAnyRole('teacher', 'admin'),
  requirePermission('edit_marks'),
  validateBody(assessmentSchema),
  controller.createAssessment
);

router.get(
  '/assessments/:id/sheet',
  requireAnyRole('teacher', 'admin'),
  validateParams(idParam),
  controller.getMarksSheet
);

router.post(
  '/assessments/:id/marks',
  requireAnyRole('teacher', 'admin'),
  requirePermission('edit_marks'),
  validateParams(idParam),
  validateBody(enterMarksSchema),
  controller.enterMarks
);

router.post(
  '/assessments/:id/publish',
  requireAnyRole('teacher', 'admin'),
  requirePermission('publish_marks'),
  validateParams(idParam),
  controller.publishAssessment
);

export default router;
