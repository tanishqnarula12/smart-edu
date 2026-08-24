import { Router } from 'express';
import * as controller from '../controllers/authController.js';
import { authenticateToken } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { authLimiter, passwordResetLimiter } from '../middleware/rateLimit.js';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  refreshSchema,
  updateProfileSchema,
  preferencesSchema,
} from '../validators/authValidators.js';

const router = Router();

// ── Public ────────────────────────────────────────────────────────────────
router.post('/register', authLimiter, validateBody(registerSchema), controller.register);
router.post('/login', authLimiter, validateBody(loginSchema), controller.login);
router.post('/refresh', validateBody(refreshSchema), controller.refresh);
router.post('/logout', controller.logout);
router.post(
  '/forgot-password',
  passwordResetLimiter,
  validateBody(forgotPasswordSchema),
  controller.forgotPassword
);
router.post('/reset-password', authLimiter, validateBody(resetPasswordSchema), controller.resetPassword);

// ── Authenticated ─────────────────────────────────────────────────────────
router.use(authenticateToken);

router.get('/me', controller.me);
router.get('/sessions', controller.listSessions);
router.post('/logout-all', controller.logoutEverywhere);
router.post('/change-password', validateBody(changePasswordSchema), controller.changePassword);
router.patch('/profile', validateBody(updateProfileSchema), controller.updateProfile);
router.patch('/preferences', validateBody(preferencesSchema), controller.updatePreferences);

export default router;
