import { Router } from 'express';
import * as controller from '../controllers/analyticsController.js';
import { authenticateToken, requireRole, requireAnyRole, requirePermission } from '../middleware/auth.js';
import { validateQuery } from '../middleware/validate.js';
import { analyticsQuerySchema } from '../validators/adminValidators.js';

const router = Router();
router.use(authenticateToken);

// Role-specific dashboards.
router.get('/student', controller.getStudentDashboard);
router.get('/teacher', requireAnyRole('teacher', 'admin'), controller.getTeacherDashboard);
router.get('/admin', requireRole('admin'), controller.getAdminDashboard);

// Cross-cutting analytics.
router.get(
  '/attendance',
  requireAnyRole('teacher', 'admin'),
  requirePermission('view_analytics'),
  validateQuery(analyticsQuerySchema),
  controller.getAttendanceAnalytics
);
router.get(
  '/academic',
  requireAnyRole('teacher', 'admin'),
  requirePermission('view_analytics'),
  validateQuery(analyticsQuerySchema),
  controller.getAcademicAnalytics
);
router.get('/risk', requireAnyRole('teacher', 'admin'), controller.getRiskAnalytics);
router.get('/student/:studentId/risk', controller.getStudentRisk);

export default router;
