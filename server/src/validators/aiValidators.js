import { z } from 'zod';
import { uuid, optionalUuid } from './common.js';

export const chatSchema = z.object({
  message: z.string().trim().min(1, 'Type a message').max(4000, 'Message is too long'),
  conversationId: uuid.optional().nullable(),
  context: z
    .object({
      studentId: uuid.optional(),
      subjectId: uuid.optional(),
      classId: uuid.optional(),
    })
    .optional(),
});

export const quizGeneratorSchema = z.object({
  subjectId: uuid,
  classId: optionalUuid,
  topic: z.string().trim().min(2, 'Enter a topic').max(200),
  difficulty: z.enum(['easy', 'medium', 'hard', 'mixed']).default('medium'),
  questionCount: z.coerce.number().int().min(1).max(50).default(10),
  questionTypes: z
    .array(z.enum(['mcq', 'true_false', 'short_answer', 'long_answer']))
    .min(1, 'Choose at least one question type')
    .default(['mcq']),
  bloomLevel: z
    .enum(['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create', 'mixed'])
    .default('understand'),
  title: z.string().max(200).optional(),
});

export const assignmentGeneratorSchema = z.object({
  subjectId: uuid,
  classId: optionalUuid,
  topic: z.string().trim().min(2).max(200),
  difficulty: z.enum(['easy', 'medium', 'hard', 'mixed']).default('medium'),
  questionCount: z.coerce.number().int().min(1).max(25).default(5),
  learningObjectives: z.array(z.string().max(300)).max(10).optional().default([]),
  title: z.string().max(200).optional(),
});

export const questionPaperSchema = z.object({
  subjectId: uuid,
  classId: optionalUuid,
  title: z.string().max(200).optional(),
  totalMarks: z.coerce.number().int().min(10).max(200).default(100),
  durationMinutes: z.coerce.number().int().min(15).max(360).default(180),
  topics: z.array(z.string().max(200)).min(1, 'List at least one topic').max(20),
  difficultyMix: z
    .object({
      easy: z.coerce.number().min(0).max(100).default(30),
      medium: z.coerce.number().min(0).max(100).default(50),
      hard: z.coerce.number().min(0).max(100).default(20),
    })
    .default({ easy: 30, medium: 50, hard: 20 }),
  bloomMix: z
    .object({
      remember: z.coerce.number().min(0).max(100).default(20),
      understand: z.coerce.number().min(0).max(100).default(30),
      apply: z.coerce.number().min(0).max(100).default(30),
      analyze: z.coerce.number().min(0).max(100).default(20),
    })
    .optional(),
});

/**
 * Natural-language student search (§26).
 *
 * The query string is turned into *validated filter parameters* by
 * queryTranslator.js. AI-generated SQL is never executed.
 */
export const nlSearchSchema = z.object({
  query: z.string().trim().min(3, 'Describe what you are looking for').max(300),
  classId: optionalUuid,
  subjectId: optionalUuid,
});

export const saveGeneratedSchema = z.object({
  kind: z.enum(['quiz', 'assignment', 'question_paper']),
  title: z.string().trim().min(2).max(200),
  subjectId: optionalUuid,
  classId: optionalUuid,
  topic: z.string().max(200).optional().nullable(),
  difficulty: z.string().max(20).optional().nullable(),
  payload: z.record(z.any()),
  isPublished: z.boolean().optional().default(false),
});

export const documentSchema = z.object({
  title: z.string().trim().min(2).max(200),
  description: z.string().max(2000).optional().nullable(),
  sourceType: z.enum(['note', 'assignment', 'notice', 'syllabus', 'faq', 'material']).default('note'),
  subjectId: optionalUuid,
  classId: optionalUuid,
  visibility: z.enum(['private', 'class', 'institution']).default('class'),
  content: z.string().max(200_000).optional().nullable(),
  fileUrl: z.string().max(500).optional().nullable(),
});

export const ragSearchSchema = z.object({
  query: z.string().trim().min(2).max(500),
  topK: z.coerce.number().int().min(1).max(20).default(5),
  subjectId: optionalUuid,
  classId: optionalUuid,
});

export default {
  chatSchema,
  quizGeneratorSchema,
  assignmentGeneratorSchema,
  questionPaperSchema,
  nlSearchSchema,
  saveGeneratedSchema,
  documentSchema,
  ragSearchSchema,
};
