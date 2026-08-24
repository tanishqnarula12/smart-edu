import { Router } from 'express';
import * as controller from '../controllers/reportController.js';
import { authenticateToken, requireRole, requireAnyRole, requirePermission } from '../middleware/auth.js';

const router = Router();
router.use(authenticateToken);

router.get('/student/:studentId', controller.getStudentReport);
router.get(
  '/class/:classId',
  requireAnyRole('teacher', 'admin'),
  requirePermission('view_reports'),
  controller.getClassReport
);
router.get(
  '/teacher/:teacherId',
  requireAnyRole('teacher', 'admin'),
  requirePermission('view_reports'),
  controller.getTeacherReport
);
router.get(
  '/institution',
  requireRole('admin'),
  requirePermission('view_reports'),
  controller.getInstitutionReport
);

export default router;
