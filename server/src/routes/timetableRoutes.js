import { Router } from 'express';
import * as controller from '../controllers/timetableController.js';
import { authenticateToken, requireRole, requirePermission } from '../middleware/auth.js';
import { validateBody, validateParams } from '../middleware/validate.js';
import { idParam } from '../validators/common.js';
import { timetableSchema } from '../validators/academicValidators.js';

const router = Router();
router.use(authenticateToken);

router.get('/', controller.getTimetable);
router.get('/today', controller.getToday);
router.get('/conflicts', requireRole('admin'), controller.listConflicts);

router.post(
  '/',
  requireRole('admin'),
  requirePermission('manage_timetable'),
  validateBody(timetableSchema),
  controller.createEntry
);

router.patch(
  '/:id',
  requireRole('admin'),
  requirePermission('manage_timetable'),
  validateParams(idParam),
  controller.updateEntry
);

router.delete(
  '/:id',
  requireRole('admin'),
  requirePermission('manage_timetable'),
  validateParams(idParam),
  controller.deleteEntry
);

export default router;
