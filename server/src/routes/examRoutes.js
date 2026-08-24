import { Router } from 'express';
import * as controller from '../controllers/examController.js';
import { authenticateToken, requireAnyRole } from '../middleware/auth.js';
import { validateBody, validateParams } from '../middleware/validate.js';
import { idParam } from '../validators/common.js';
import { examSchema } from '../validators/academicValidators.js';

const router = Router();
router.use(authenticateToken);

router.get('/', controller.listExams);
router.post('/', requireAnyRole('teacher', 'admin'), validateBody(examSchema), controller.createExam);
router.delete('/:id', requireAnyRole('teacher', 'admin'), validateParams(idParam), controller.deleteExam);

export default router;
