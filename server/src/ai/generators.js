import { queryOne } from '../db/pool.js';
import { complete, isLiveProvider } from './aiService.js';

/**
 * AI content generation: quizzes, assignments and question papers (§23–§25).
 *
 * Every generator produces the same envelope regardless of provider, so the
 * UI never branches on whether a live model answered. Without an API key the
 * deterministic builders produce genuinely structured, editable material —
 * real Bloom's verbs, a real marks distribution, a real answer key — rather
 * than lorem ipsum.
 */

const BLOOM_VERBS = {
  remember: ['Define', 'List', 'State', 'Identify', 'Name', 'Recall'],
  understand: ['Explain', 'Describe', 'Summarise', 'Interpret', 'Classify', 'Compare'],
  apply: ['Apply', 'Demonstrate', 'Calculate', 'Solve', 'Use', 'Implement'],
  analyze: ['Analyse', 'Differentiate', 'Examine', 'Contrast', 'Break down', 'Investigate'],
  evaluate: ['Evaluate', 'Justify', 'Critique', 'Assess', 'Defend', 'Judge'],
  create: ['Design', 'Construct', 'Formulate', 'Develop', 'Propose', 'Compose'],
};

const DIFFICULTY_MARKS = { easy: 1, medium: 2, hard: 4 };

const pickVerb = (level, index) => {
  const verbs = BLOOM_VERBS[level] ?? BLOOM_VERBS.understand;
  return verbs[index % verbs.length];
};

const cycle = (list, index) => list[index % list.length];

async function subjectName(subjectId) {
  if (!subjectId) return 'the subject';
  const row = await queryOne('SELECT name FROM subjects WHERE id = $1', [subjectId]);
  return row?.name ?? 'the subject';
}

/** Ask a live model for JSON, and fall back cleanly if it returns anything else. */
// A structured JSON payload for ~10 questions fits comfortably under this —
// leaner than before so one generation doesn't eat a disproportionate slice
// of a free-tier daily token budget.
async function generateWithModel({ system, prompt, maxTokens = 1800 }) {
  const response = await complete({
    messages: [{ role: 'user', content: prompt }],
    system,
    temperature: 0.7,
    maxTokens,
  });

  if (response.provider === 'mock' || response.fallback) return null;

  try {
    // Models often wrap JSON in a fenced block; take the outermost object.
    const match = response.content.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return { parsed: JSON.parse(match[0]), meta: response };
  } catch (error) {
    console.warn('[ai] model returned unparseable JSON, using deterministic generator:', error.message);
    return null;
  }
}

// ═══════════════════════════ QUIZ GENERATOR ═══════════════════════════════

export async function generateQuiz({
  subjectId,
  topic,
  difficulty = 'medium',
  questionCount = 10,
  questionTypes = ['mcq'],
  bloomLevel = 'understand',
  title,
}) {
  const subject = await subjectName(subjectId);
  const quizTitle = title || `${topic} — ${subject} quiz`;

  if (isLiveProvider()) {
    const result = await generateWithModel({
      system:
        'You are an experienced examiner. Respond with ONLY a JSON object, no prose and no markdown fence. ' +
        'Schema: {"questions":[{"number":1,"type":"mcq|true_false|short_answer|long_answer",' +
        '"question":"...","options":["A","B","C","D"],"answer":"...","explanation":"...",' +
        '"marks":2,"bloomLevel":"understand","difficulty":"medium"}]}. ' +
        'Only include "options" for mcq and true_false questions.',
      prompt:
        `Write ${questionCount} ${difficulty} questions on "${topic}" for the subject ${subject}. ` +
        `Use these question types: ${questionTypes.join(', ')}. ` +
        `Target Bloom's taxonomy level: ${bloomLevel}. ` +
        'Each question needs a correct answer and a one-sentence explanation.',
    });

    if (result?.parsed?.questions?.length) {
      return buildEnvelope({
        title: quizTitle,
        topic,
        subject,
        difficulty,
        bloomLevel,
        questions: result.parsed.questions,
        generatedBy: `${result.meta.provider}:${result.meta.model}`,
      });
    }
  }

  return buildEnvelope({
    title: quizTitle,
    topic,
    subject,
    difficulty,
    bloomLevel,
    questions: deterministicQuestions({ topic, subject, difficulty, questionCount, questionTypes, bloomLevel }),
    generatedBy: 'smart-edu-template',
  });
}

/**
 * Template-driven question construction.
 *
 * These are real, usable question stems built from the topic and the requested
 * Bloom's level — a teacher edits them rather than writing from scratch, which
 * is the point of the feature even without a model behind it.
 */
function deterministicQuestions({ topic, subject, difficulty, questionCount, questionTypes, bloomLevel }) {
  const questions = [];
  const levels = bloomLevel === 'mixed'
    ? ['remember', 'understand', 'apply', 'analyze']
    : [bloomLevel];

  const difficulties = difficulty === 'mixed' ? ['easy', 'medium', 'hard'] : [difficulty];

  for (let index = 0; index < questionCount; index += 1) {
    const type = cycle(questionTypes, index);
    const level = cycle(levels, index);
    const questionDifficulty = cycle(difficulties, index);
    const verb = pickVerb(level, index);
    const marks = DIFFICULTY_MARKS[questionDifficulty] ?? 2;

    const base = {
      number: index + 1,
      type,
      marks,
      bloomLevel: level,
      difficulty: questionDifficulty,
    };

    switch (type) {
      case 'mcq':
        questions.push({
          ...base,
          question: `Which of the following best describes ${topic} in the context of ${subject}?`,
          options: [
            `The defining principle of ${topic} and how it is applied`,
            `A method unrelated to ${topic}`,
            `An outdated approach that ${topic} replaced`,
            `A special case that does not generalise`,
          ],
          answer: `The defining principle of ${topic} and how it is applied`,
          answerIndex: 0,
          explanation: `The correct option states the central idea of ${topic}; the others describe adjacent or incorrect concepts.`,
        });
        break;

      case 'true_false':
        questions.push({
          ...base,
          marks: 1,
          question: `True or false: ${topic} can be applied directly to problems in ${subject} without further assumptions.`,
          options: ['True', 'False'],
          answer: 'False',
          explanation: `Applying ${topic} normally requires its preconditions to hold — state them before using it.`,
        });
        break;

      case 'short_answer':
        questions.push({
          ...base,
          question: `${verb} ${topic} in two or three sentences, with one example from ${subject}.`,
          answer: `A correct response defines ${topic}, states where it applies, and gives a concrete ${subject} example.`,
          explanation: `Award full marks for a correct definition plus a relevant worked example.`,
        });
        break;

      case 'long_answer':
        questions.push({
          ...base,
          marks: Math.max(marks * 2, 5),
          question: `${verb} the role of ${topic} within ${subject}. Discuss its assumptions, its limitations, and one situation where an alternative approach would be preferable.`,
          answer:
            `A strong answer covers: (1) a precise statement of ${topic}; (2) the assumptions it relies on; ` +
            `(3) at least one limitation; (4) a justified alternative for a case where those assumptions fail.`,
          explanation: 'Mark against the four points; a candidate need not cover them in that order.',
        });
        break;

      default:
        questions.push({
          ...base,
          question: `${verb} ${topic}.`,
          answer: `An acceptable answer demonstrates understanding of ${topic}.`,
          explanation: '',
        });
    }
  }

  return questions;
}

function buildEnvelope({ title, topic, subject, difficulty, bloomLevel, questions, generatedBy }) {
  const normalised = questions.map((question, index) => ({
    number: question.number ?? index + 1,
    type: question.type ?? 'mcq',
    question: question.question,
    options: question.options ?? null,
    answer: question.answer,
    answerIndex: question.answerIndex,
    explanation: question.explanation ?? '',
    marks: Number(question.marks) || 1,
    bloomLevel: question.bloomLevel ?? bloomLevel,
    difficulty: question.difficulty ?? difficulty,
  }));

  const totalMarks = normalised.reduce((sum, question) => sum + question.marks, 0);

  return {
    title,
    topic,
    subject,
    difficulty,
    bloomLevel,
    questionCount: normalised.length,
    totalMarks,
    questions: normalised,
    // The answer key is derived from the questions so the two can never drift.
    answerKey: normalised.map((question) => ({
      number: question.number,
      answer: question.answer,
      explanation: question.explanation,
      marks: question.marks,
    })),
    generatedBy,
    generatedAt: new Date().toISOString(),
  };
}

// ════════════════════════ ASSIGNMENT GENERATOR ════════════════════════════

export async function generateAssignment({
  subjectId,
  topic,
  difficulty = 'medium',
  questionCount = 5,
  learningObjectives = [],
  title,
}) {
  const subject = await subjectName(subjectId);
  const assignmentTitle = title || `${topic} — ${subject} assignment`;

  const objectives = learningObjectives.length
    ? learningObjectives
    : [
        `Explain the core principles of ${topic}`,
        `Apply ${topic} to unfamiliar problems in ${subject}`,
        `Evaluate when ${topic} is and is not appropriate`,
      ];

  if (isLiveProvider()) {
    const result = await generateWithModel({
      system:
        'You design coursework. Respond with ONLY a JSON object, no prose. Schema: ' +
        '{"introduction":"...","tasks":[{"number":1,"task":"...","guidance":"...","marks":10,' +
        '"bloomLevel":"apply"}],"rubric":[{"criterion":"...","weight":30,"descriptor":"..."}]}',
      prompt:
        `Design an assignment on "${topic}" for ${subject} at ${difficulty} difficulty with ` +
        `${questionCount} tasks. Learning objectives: ${objectives.join('; ')}. ` +
        'Include a short introduction and a marking rubric.',
    });

    if (result?.parsed?.tasks?.length) {
      return {
        title: assignmentTitle,
        subject,
        topic,
        difficulty,
        objectives,
        introduction: result.parsed.introduction ?? '',
        tasks: result.parsed.tasks,
        rubric: result.parsed.rubric ?? defaultRubric(),
        totalMarks: result.parsed.tasks.reduce((sum, task) => sum + (Number(task.marks) || 0), 0),
        generatedBy: `${result.meta.provider}:${result.meta.model}`,
        generatedAt: new Date().toISOString(),
      };
    }
  }

  const levels = ['understand', 'apply', 'analyze', 'evaluate', 'create'];
  const tasks = Array.from({ length: questionCount }, (_, index) => {
    const level = cycle(levels, index);
    const verb = pickVerb(level, index);
    const marks = 5 + index * 3;

    return {
      number: index + 1,
      task: `${verb} ${topic}${index === 0 ? '' : ` in the context of ${cycle(objectives, index)}`}.`,
      guidance:
        level === 'create' || level === 'evaluate'
          ? 'Support your position with reasoning and at least one worked example. Cite any sources you use.'
          : 'Show your working. Marks are awarded for method as well as the final answer.',
      marks,
      bloomLevel: level,
    };
  });

  return {
    title: assignmentTitle,
    subject,
    topic,
    difficulty,
    objectives,
    introduction:
      `This assignment covers ${topic} in ${subject}. Work through the tasks in order — each builds ` +
      `on the previous one. Show your reasoning throughout; method carries marks independently of the answer.`,
    tasks,
    rubric: defaultRubric(),
    totalMarks: tasks.reduce((sum, task) => sum + task.marks, 0),
    generatedBy: 'smart-edu-template',
    generatedAt: new Date().toISOString(),
  };
}

const defaultRubric = () => [
  { criterion: 'Understanding of concepts', weight: 30, descriptor: 'Correct, precise use of the key ideas' },
  { criterion: 'Application and method', weight: 30, descriptor: 'Appropriate approach, working shown clearly' },
  { criterion: 'Analysis and reasoning', weight: 25, descriptor: 'Conclusions follow from the evidence given' },
  { criterion: 'Presentation', weight: 15, descriptor: 'Organised, legible, correctly referenced' },
];

// ══════════════════════ QUESTION PAPER GENERATOR ══════════════════════════

export async function generateQuestionPaper({
  subjectId,
  title,
  totalMarks = 100,
  durationMinutes = 180,
  topics = [],
  difficultyMix = { easy: 30, medium: 50, hard: 20 },
  bloomMix,
}) {
  const subject = await subjectName(subjectId);
  const paperTitle = title || `${subject} — End of term examination`;

  // Three sections in the conventional shape: short objective, medium, long.
  const sections = [
    { name: 'Section A — Objective', type: 'mcq', marksEach: 1, share: 0.2, difficulty: 'easy' },
    { name: 'Section B — Short answer', type: 'short_answer', marksEach: 5, share: 0.4, difficulty: 'medium' },
    { name: 'Section C — Long answer', type: 'long_answer', marksEach: 10, share: 0.4, difficulty: 'hard' },
  ];

  const builtSections = sections.map((section, sectionIndex) => {
    const sectionMarks = Math.round(totalMarks * section.share);
    const count = Math.max(1, Math.round(sectionMarks / section.marksEach));

    const questions = Array.from({ length: count }, (_, index) => {
      const topic = topics.length ? cycle(topics, index + sectionIndex) : subject;
      const level = section.type === 'mcq' ? 'remember' : section.type === 'short_answer' ? 'apply' : 'evaluate';
      const verb = pickVerb(level, index);

      const base = {
        number: index + 1,
        type: section.type,
        marks: section.marksEach,
        topic,
        bloomLevel: level,
        difficulty: section.difficulty,
      };

      if (section.type === 'mcq') {
        return {
          ...base,
          question: `Which statement about ${topic} is correct?`,
          options: [
            `${topic} behaves as described by its defining principle`,
            `${topic} has no bearing on ${subject}`,
            `${topic} applies only in trivial cases`,
            `${topic} was superseded and is no longer used`,
          ],
          answer: `${topic} behaves as described by its defining principle`,
          answerIndex: 0,
        };
      }

      return {
        ...base,
        question:
          section.type === 'short_answer'
            ? `${verb} ${topic} and give one example of its use in ${subject}.`
            : `${verb} the significance of ${topic} in ${subject}. Discuss its assumptions, limitations and one alternative approach.`,
        answer:
          section.type === 'short_answer'
            ? `Correct definition of ${topic} plus a relevant example.`
            : `A full answer covers the principle, its assumptions, at least one limitation, and a justified alternative.`,
      };
    });

    return {
      name: section.name,
      instructions:
        section.type === 'mcq'
          ? 'Answer all questions. One mark each.'
          : section.type === 'short_answer'
            ? `Answer any ${Math.max(1, count - 1)} of ${count} questions.`
            : `Answer any ${Math.max(1, count - 1)} of ${count} questions. Answers should be structured and referenced.`,
      questionCount: count,
      marks: count * section.marksEach,
      questions,
    };
  });

  const paperMarks = builtSections.reduce((sum, section) => sum + section.marks, 0);

  return {
    title: paperTitle,
    subject,
    topics,
    totalMarks: paperMarks,
    requestedMarks: totalMarks,
    durationMinutes,
    difficultyMix,
    bloomMix: bloomMix ?? { remember: 20, understand: 30, apply: 30, analyze: 20 },
    instructions: [
      `Time allowed: ${Math.floor(durationMinutes / 60)} hours ${durationMinutes % 60} minutes.`,
      `Maximum marks: ${paperMarks}.`,
      'All questions carry the marks indicated against them.',
      'Answers must be written in the answer booklet provided.',
    ],
    sections: builtSections,
    answerKey: builtSections.flatMap((section) =>
      section.questions.map((question) => ({
        section: section.name,
        number: question.number,
        answer: question.answer,
        marks: question.marks,
      }))
    ),
    generatedBy: 'smart-edu-template',
    generatedAt: new Date().toISOString(),
  };
}

export default { generateQuiz, generateAssignment, generateQuestionPaper };
