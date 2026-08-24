import { Router } from 'express';
import * as controller from '../controllers/userController.js';
import { authenticateToken, requireRole, requirePermission } from '../middleware/auth.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.js';
import { idParam } from '../validators/common.js';
import { adminCreateUserSchema } from '../validators/authValidators.js';
import {
  userQuerySchema,
  updateUserSchema,
  resetUserPasswordSchema,
  linkParentSchema,
} from '../validators/adminValidators.js';

// User management is an administrator capability end to end.
const router = Router();
router.use(authenticateToken, requireRole('admin'));

router.get('/', validateQuery(userQuerySchema), controller.listUsers);
router.get('/parent-links', controller.listParentLinks);
router.get('/:id', validateParams(idParam), controller.getUser);

router.post(
  '/',
  requirePermission('manage_users'),
  validateBody(adminCreateUserSchema),
  controller.createUser
);

router.post(
  '/link-parent',
  requirePermission('manage_users'),
  validateBody(linkParentSchema),
  controller.linkParent
);

router.delete(
  '/link-parent/:id',
  requirePermission('manage_users'),
  validateParams(idParam),
  controller.unlinkParent
);

router.post(
  '/:id/reset-password',
  requirePermission('manage_users'),
  validateParams(idParam),
  validateBody(resetUserPasswordSchema),
  controller.resetUserPassword
);

router.patch(
  '/:id',
  requirePermission('manage_users'),
  validateParams(idParam),
  validateBody(updateUserSchema),
  controller.updateUser
);

router.delete(
  '/:id',
  requirePermission('manage_users'),
  validateParams(idParam),
  controller.deleteUser
);

export default router;
