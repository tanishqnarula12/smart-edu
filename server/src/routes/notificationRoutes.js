import { Router } from 'express';
import * as controller from '../controllers/notificationController.js';
import { authenticateToken } from '../middleware/auth.js';
import { validateParams, validateQuery } from '../middleware/validate.js';
import { idParam } from '../validators/common.js';
import { notificationQuerySchema } from '../validators/engagementValidators.js';

const router = Router();
router.use(authenticateToken);

router.get('/', validateQuery(notificationQuerySchema), controller.listNotifications);
router.get('/unread-count', controller.getUnreadCount);
router.patch('/read-all', controller.markAllRead);
router.patch('/:id/read', validateParams(idParam), controller.markRead);
router.delete('/:id', validateParams(idParam), controller.deleteNotification);
router.delete('/', controller.clearAll);

export default router;
