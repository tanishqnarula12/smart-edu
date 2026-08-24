import { Router } from 'express';
import * as controller from '../controllers/attendanceController.js';
import { authenticateToken, requireAnyRole, requirePermission } from '../middleware/auth.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.js';
import { idParam } from '../validators/common.js';
import {
  markAttendanceSchema,
  updateAttendanceSchema,
  attendanceQuerySchema,
} from '../validators/academicValidators.js';

const router = Router();
router.use(authenticateToken);

// ── Reads: everyone, scoped by role inside the controller ─────────────────
router.get('/', validateQuery(attendanceQuerySchema), controller.listRecords);
router.get('/summary', controller.getSummary);

// ── Teacher / admin ───────────────────────────────────────────────────────
router.get('/register', requireAnyRole('teacher', 'admin'), controller.getRegister);
router.get('/low', requireAnyRole('teacher', 'admin'), controller.getLowAttendance);
router.get('/class/:classId', requireAnyRole('teacher', 'admin'), controller.getClassOverview);

router.post(
  '/',
  requireAnyRole('teacher', 'admin'),
  requirePermission('edit_attendance'),
  validateBody(markAttendanceSchema),
  controller.markAttendance
);

router.patch(
  '/:id',
  requireAnyRole('teacher', 'admin'),
  requirePermission('edit_attendance'),
  validateParams(idParam),
  validateBody(updateAttendanceSchema),
  controller.updateRecord
);

export default router;
