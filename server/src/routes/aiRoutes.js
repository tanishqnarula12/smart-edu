import { Router } from 'express';
import * as controller from '../controllers/aiController.js';
import { authenticateToken, requireRole, requireAnyRole, requirePermission } from '../middleware/auth.js';
import { validateBody, validateParams } from '../middleware/validate.js';
import { aiLimiter } from '../middleware/rateLimit.js';
import { upload, uploadTo } from '../middleware/upload.js';
import { idParam } from '../validators/common.js';
import {
  chatSchema,
  quizGeneratorSchema,
  assignmentGeneratorSchema,
  questionPaperSchema,
  nlSearchSchema,
  saveGeneratedSchema,
  documentSchema,
  ragSearchSchema,
} from '../validators/aiValidators.js';

const router = Router();
router.use(authenticateToken, requirePermission('use_ai_tools'));

// ── Status ────────────────────────────────────────────────────────────────
router.get('/status', controller.getStatus);
router.get('/suggestions', controller.getSuggestions);

// ── Chat (all roles; the agent is chosen from the caller's role) ───────────
router.post('/chat', aiLimiter, validateBody(chatSchema), controller.chat);
router.get('/conversations', controller.listConversations);
router.get('/conversations/:id', validateParams(idParam), controller.getConversation);
router.delete('/conversations/:id', validateParams(idParam), controller.deleteConversation);

// ── Student tools ─────────────────────────────────────────────────────────
router.post('/study-plan', requireRole('student'), aiLimiter, controller.studyPlan);
router.get('/insights', controller.getInsights);

// ── Teacher tools ─────────────────────────────────────────────────────────
router.post(
  '/quiz',
  requireAnyRole('teacher', 'admin'),
  aiLimiter,
  validateBody(quizGeneratorSchema),
  controller.generateQuiz
);
router.post(
  '/assignment',
  requireAnyRole('teacher', 'admin'),
  aiLimiter,
  validateBody(assignmentGeneratorSchema),
  controller.generateAssignment
);
router.post(
  '/question-paper',
  requireAnyRole('teacher', 'admin'),
  aiLimiter,
  validateBody(questionPaperSchema),
  controller.generateQuestionPaper
);
router.post(
  '/search',
  requireAnyRole('teacher', 'admin'),
  validateBody(nlSearchSchema),
  controller.naturalLanguageSearch
);

router.get('/generated', requireAnyRole('teacher', 'admin'), controller.listGenerated);
router.post(
  '/generated',
  requireAnyRole('teacher', 'admin'),
  validateBody(saveGeneratedSchema),
  controller.saveGenerated
);
router.delete(
  '/generated/:id',
  requireAnyRole('teacher', 'admin'),
  validateParams(idParam),
  controller.deleteGenerated
);

// ── RAG / documents ───────────────────────────────────────────────────────
router.get('/documents', controller.listDocuments);
router.post(
  '/documents',
  requireAnyRole('teacher', 'admin'),
  uploadTo('documents'),
  upload.single('file'),
  validateBody(documentSchema),
  controller.uploadDocument
);
router.delete('/documents/:id', validateParams(idParam), controller.deleteDocument);
router.post('/retrieve', validateBody(ragSearchSchema), controller.retrieveChunks);

export default router;
