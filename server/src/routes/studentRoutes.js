import { Router } from 'express';
import * as controller from '../controllers/studentController.js';
import { authenticateToken, requireAnyRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { remarkSchema } from '../validators/engagementValidators.js';

const router = Router();
router.use(authenticateToken);

// Listing students is a staff capability; the individual routes below let a
// parent through, but only via the access layer's privacy checks.
router.get('/', requireAnyRole('teacher', 'admin'), controller.listStudents);

router.get('/:studentId', controller.getStudentProfile);
router.get('/:studentId/marks', controller.getStudentMarks);
router.get('/:studentId/attendance', controller.getStudentAttendance);

router.post(
  '/:studentId/remarks',
  requireAnyRole('teacher', 'admin'),
  validateBody(remarkSchema.omit({ studentId: true })),
  controller.addRemark
);

export default router;
