import { Router } from 'express';
import * as controller from '../controllers/teacherController.js';
import { authenticateToken, requireAnyRole } from '../middleware/auth.js';

const router = Router();
router.use(authenticateToken);

router.get('/', requireAnyRole('admin', 'teacher'), controller.listTeachers);
router.get('/me/classes', requireAnyRole('teacher', 'admin'), controller.getMyClasses);
router.get('/me/students', requireAnyRole('teacher', 'admin'), controller.getMyStudents);
router.get('/:id', requireAnyRole('admin', 'teacher'), controller.getTeacher);

export default router;
