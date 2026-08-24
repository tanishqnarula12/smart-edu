import { Router } from 'express';
import * as controller from '../controllers/noticeController.js';
import { authenticateToken, requireAnyRole, requirePermission } from '../middleware/auth.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.js';
import { idParam } from '../validators/common.js';
import { noticeSchema, noticeQuerySchema } from '../validators/engagementValidators.js';

const router = Router();
router.use(authenticateToken);

router.get('/', validateQuery(noticeQuerySchema), controller.listNotices);
router.get('/:id', validateParams(idParam), controller.getNotice);

router.post(
  '/',
  requireAnyRole('teacher', 'admin'),
  requirePermission('manage_notices'),
  validateBody(noticeSchema),
  controller.createNotice
);

router.patch(
  '/:id',
  requireAnyRole('teacher', 'admin'),
  requirePermission('manage_notices'),
  validateParams(idParam),
  validateBody(noticeSchema.partial()),
  controller.updateNotice
);

router.delete(
  '/:id',
  requireAnyRole('teacher', 'admin'),
  requirePermission('manage_notices'),
  validateParams(idParam),
  controller.deleteNotice
);

export default router;
