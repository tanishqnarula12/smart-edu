import { query, queryOne, queryMany } from '../db/pool.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess, sendCreated } from '../utils/response.js';
import { ApiError } from '../utils/ApiError.js';
import { fileUrl } from '../middleware/upload.js';
import { providerInfo } from '../ai/aiService.js';
import * as studentAgent from '../ai/studentAgent.js';
import * as parentAgent from '../ai/parentAgent.js';
import * as teacherAgent from '../ai/teacherAgent.js';
import * as adminAgent from '../ai/adminAgent.js';
import * as generators from '../ai/generators.js';
import * as rag from '../ai/ragService.js';
import { runNaturalLanguageSearch, SUPPORTED_INTENTS } from '../ai/queryTranslator.js';
import * as marksService from '../services/marksService.js';
import * as analytics from '../services/analyticsService.js';
import * as access from '../services/accessService.js';

/**
 * AI endpoints (§33). The role on the request decides which agent runs — a
 * client cannot ask for another role's agent, because the mapping happens here
 * rather than being taken from the request body.
 */

const AGENTS = {
  student: studentAgent,
  parent: parentAgent,
  teacher: teacherAgent,
  admin: adminAgent,
};

/** Load conversation history, verifying the conversation belongs to the caller. */
async function loadConversation(conversationId, userId) {
  if (!conversationId) return { conversation: null, history: [] };

  const conversation = await queryOne(
    'SELECT id, user_id, title, agent FROM ai_conversations WHERE id = $1',
    [conversationId]
  );
  if (!conversation) throw ApiError.notFound('Conversation not found');
  if (conversation.user_id !== userId) throw ApiError.forbidden('That conversation is not yours');

  const messages = await queryMany(
    'SELECT role, content FROM ai_messages WHERE conversation_id = $1 ORDER BY created_at LIMIT 40',
    [conversationId]
  );

  return { conversation, history: messages };
}

/** POST /api/ai/chat */
export const chat = asyncHandler(async (req, res) => {
  const { message, conversationId, context = {} } = req.body;
  const agent = AGENTS[req.user.role];
  if (!agent) throw ApiError.forbidden('The AI assistant is not available for this role');

  const { conversation, history } = await loadConversation(conversationId, req.user.id);

  const response = await agent.chat({
    user: req.user,
    message,
    history,
    studentId: context.studentId,
    classId: context.classId,
  });

  // Persist the turn so conversation history survives a page reload.
  const activeConversation =
    conversation ??
    (await queryOne(
      `INSERT INTO ai_conversations (user_id, title, agent)
       VALUES ($1, $2, $3) RETURNING id, title, agent`,
      [req.user.id, message.slice(0, 80), req.user.role]
    ));

  await query(
    `INSERT INTO ai_messages (conversation_id, role, content) VALUES ($1, 'user', $2)`,
    [activeConversation.id, message]
  );
  await query(
    `INSERT INTO ai_messages (conversation_id, role, content, metadata)
     VALUES ($1, 'assistant', $2, $3)`,
    [
      activeConversation.id,
      response.content,
      JSON.stringify({
        provider: response.provider,
        model: response.model,
        fallback: response.fallback ?? false,
        fallbackReason: response.fallbackReason,
      }),
    ]
  );
  await query('UPDATE ai_conversations SET updated_at = NOW() WHERE id = $1', [activeConversation.id]);

  return sendSuccess(
    res,
    {
      conversationId: activeConversation.id,
      message: response.content,
      provider: response.provider,
      model: response.model,
      fallback: response.fallback ?? false,
      fallbackReason: response.fallbackReason,
      grounded: response.grounded ?? true,
      sources: response.sources ?? [],
      context: response.context,
    },
    'Response ready'
  );
});

/** GET /api/ai/conversations */
export const listConversations = asyncHandler(async (req, res) => {
  const rows = await queryMany(
    `SELECT c.id, c.title, c.agent, c.created_at, c.updated_at,
            (SELECT COUNT(*) FROM ai_messages m WHERE m.conversation_id = c.id)::int AS message_count
       FROM ai_conversations c
      WHERE c.user_id = $1
      ORDER BY c.updated_at DESC
      LIMIT 30`,
    [req.user.id]
  );
  return sendSuccess(res, rows, 'Conversations');
});

/** GET /api/ai/conversations/:id */
export const getConversation = asyncHandler(async (req, res) => {
  const { conversation, history } = await loadConversation(req.params.id, req.user.id);
  const messages = await queryMany(
    'SELECT id, role, content, metadata, created_at FROM ai_messages WHERE conversation_id = $1 ORDER BY created_at',
    [req.params.id]
  );
  void history;
  return sendSuccess(res, { conversation, messages }, 'Conversation');
});

/** DELETE /api/ai/conversations/:id */
export const deleteConversation = asyncHandler(async (req, res) => {
  const { rowCount } = await query('DELETE FROM ai_conversations WHERE id = $1 AND user_id = $2', [
    req.params.id,
    req.user.id,
  ]);
  if (!rowCount) throw ApiError.notFound('Conversation not found');
  return sendSuccess(res, null, 'Conversation deleted');
});

/** GET /api/ai/suggestions — role-specific starter prompts (§57). */
export const getSuggestions = asyncHandler(async (req, res) => {
  const agent = AGENTS[req.user.role];
  return sendSuccess(
    res,
    {
      role: req.user.role,
      suggestions: agent?.SUGGESTED_PROMPTS ?? [],
      provider: providerInfo(),
    },
    'Suggested prompts'
  );
});

/** GET /api/ai/status — provider and RAG configuration. */
export const getStatus = asyncHandler(async (_req, res) => {
  return sendSuccess(
    res,
    { ai: providerInfo(), rag: rag.ragStatus(), supportedSearchIntents: SUPPORTED_INTENTS },
    'AI status'
  );
});

// ═════════════════════════ STUDENT-ONLY TOOLS ═════════════════════════════

/** POST /api/ai/study-plan */
export const studyPlan = asyncHandler(async (req, res) => {
  const days = Math.min(Math.max(Number(req.body.days) || 14, 3), 60);
  const plan = await studentAgent.studyPlan({ user: req.user, days });
  return sendSuccess(res, { plan: plan.content, provider: plan.provider, days }, 'Study plan ready');
});

/** GET /api/ai/insights — the progress-page insight panel (§37). */
export const getInsights = asyncHandler(async (req, res) => {
  let studentId = req.user.id;

  if (req.user.role !== 'student') {
    studentId = req.query.studentId;
    if (!studentId) throw ApiError.badRequest('A studentId is required');
    await access.assertCanAccessStudentData(req.user, studentId, 'reports');
  }

  const analysis =
    req.user.role === 'student'
      ? await studentAgent.analyseWeakTopics({ user: req.user })
      : { insights: [], strengths: [], weaknesses: [] };

  return sendSuccess(res, analysis, 'Insights');
});

// ════════════════════════ TEACHER-ONLY TOOLS ══════════════════════════════

/** POST /api/ai/quiz */
export const generateQuiz = asyncHandler(async (req, res) => {
  const quiz = await generators.generateQuiz(req.body);
  return sendSuccess(res, quiz, `Generated ${quiz.questionCount} questions`);
});

/** POST /api/ai/assignment */
export const generateAssignment = asyncHandler(async (req, res) => {
  const assignment = await generators.generateAssignment(req.body);
  return sendSuccess(res, assignment, `Generated ${assignment.tasks.length} tasks`);
});

/** POST /api/ai/question-paper */
export const generateQuestionPaper = asyncHandler(async (req, res) => {
  const paper = await generators.generateQuestionPaper(req.body);
  return sendSuccess(res, paper, `Generated a ${paper.totalMarks}-mark paper`);
});

/** POST /api/ai/generated — save generated content for later. */
export const saveGenerated = asyncHandler(async (req, res) => {
  const row = await queryOne(
    `INSERT INTO generated_content
       (teacher_id, kind, title, subject_id, class_id, topic, difficulty, payload, is_published)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      req.user.id,
      req.body.kind,
      req.body.title,
      req.body.subjectId ?? null,
      req.body.classId ?? null,
      req.body.topic ?? null,
      req.body.difficulty ?? null,
      JSON.stringify(req.body.payload),
      req.body.isPublished ?? false,
    ]
  );
  return sendCreated(res, row, 'Saved');
});

/** GET /api/ai/generated */
export const listGenerated = asyncHandler(async (req, res) => {
  const rows = await queryMany(
    `SELECT g.id, g.kind, g.title, g.topic, g.difficulty, g.is_published, g.created_at,
            s.name AS subject_name, c.name AS class_name, c.section,
            g.payload
       FROM generated_content g
       LEFT JOIN subjects s ON s.id = g.subject_id
       LEFT JOIN classes c  ON c.id = g.class_id
      WHERE g.teacher_id = $1
        AND ($2::text IS NULL OR g.kind = $2::text)
      ORDER BY g.created_at DESC
      LIMIT 50`,
    [req.user.id, req.query.kind ?? null]
  );
  return sendSuccess(res, rows, 'Saved content');
});

/** DELETE /api/ai/generated/:id */
export const deleteGenerated = asyncHandler(async (req, res) => {
  const { rowCount } = await query('DELETE FROM generated_content WHERE id = $1 AND teacher_id = $2', [
    req.params.id,
    req.user.id,
  ]);
  if (!rowCount) throw ApiError.notFound('Not found');
  return sendSuccess(res, null, 'Deleted');
});

/**
 * POST /api/ai/search — natural-language student search (§26).
 * Runs through the intent translator; no generated SQL is ever executed.
 */
export const naturalLanguageSearch = asyncHandler(async (req, res) => {
  const result = await runNaturalLanguageSearch({
    user: req.user,
    text: req.body.query,
    services: {
      getDecliningStudents: marksService.getDecliningStudents,
      getRiskRegister: analytics.getRiskRegister,
    },
  });

  return sendSuccess(res, result, result.message);
});

// ═══════════════════════════ RAG / DOCUMENTS ══════════════════════════════

/** POST /api/ai/documents — upload or paste study material. */
export const uploadDocument = asyncHandler(async (req, res) => {
  const content = req.body.content ?? '';
  const uploadedFileUrl = req.file ? fileUrl(req.file) : req.body.fileUrl ?? null;

  if (!content.trim() && !uploadedFileUrl) {
    throw ApiError.badRequest('Provide text content or attach a file');
  }

  const result = await rag.ingestDocument({
    ...req.body,
    content,
    fileUrl: uploadedFileUrl,
    uploadedBy: req.user.id,
  });

  return sendCreated(
    res,
    result,
    result.chunkCount
      ? `Document stored and indexed into ${result.chunkCount} chunk(s)`
      : 'Document stored (no text content to index)'
  );
});

/** GET /api/ai/documents */
export const listDocuments = asyncHandler(async (req, res) => {
  const documents = await rag.listDocuments(req.user, {
    subjectId: req.query.subjectId ?? null,
    classId: req.query.classId ?? null,
  });
  return sendSuccess(res, { documents, status: rag.ragStatus() }, 'Documents');
});

/** DELETE /api/ai/documents/:id */
export const deleteDocument = asyncHandler(async (req, res) => {
  const document = await rag.getDocument(req.params.id, req.user);
  if (!document) throw ApiError.notFound('Document not found');
  if (document.uploaded_by !== req.user.id && req.user.role !== 'admin') {
    throw ApiError.forbidden('You can only delete documents you uploaded');
  }

  await rag.deleteDocument(req.params.id);
  return sendSuccess(res, null, 'Document deleted');
});

/** POST /api/ai/retrieve — retrieval preview, useful for debugging RAG. */
export const retrieveChunks = asyncHandler(async (req, res) => {
  const chunks = await rag.retrieve({
    user: req.user,
    query: req.body.query,
    topK: req.body.topK,
    subjectId: req.body.subjectId ?? null,
    classId: req.body.classId ?? null,
  });

  return sendSuccess(
    res,
    { chunks, status: rag.ragStatus() },
    chunks.length ? `${chunks.length} relevant passage(s)` : 'No indexed material matched that query'
  );
});

export default {
  chat,
  listConversations,
  getConversation,
  deleteConversation,
  getSuggestions,
  getStatus,
  studyPlan,
  getInsights,
  generateQuiz,
  generateAssignment,
  generateQuestionPaper,
  saveGenerated,
  listGenerated,
  deleteGenerated,
  naturalLanguageSearch,
  uploadDocument,
  listDocuments,
  deleteDocument,
  retrieveChunks,
};
