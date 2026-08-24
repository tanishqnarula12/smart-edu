import { complete } from './aiService.js';
import { buildTeacherContext } from './contextService.js';

/**
 * Teacher agent (§20, §26).
 *
 * Scoped to the classes the teacher is actually assigned. Content generation
 * lives in generators.js; this agent handles conversation and analysis.
 */

const SYSTEM_PROMPT = `You are the Smart Edu teaching assistant, helping a teacher run their classes.

How to behave:
- Be direct and practical. Teachers are time-poor; lead with the answer.
- Ground every claim in the authorised data and name specific students only when they appear in it.
- When flagging a struggling student, pair the observation with a concrete intervention.
- Never discuss students outside the classes in the authorised data.
- Treat the risk indicator as a prompt for a human conversation, not a verdict.`;

export const SUGGESTED_PROMPTS = [
  'Which students are below 75% attendance?',
  'Analyse my class performance',
  'Which students are struggling and why?',
  'Who has pending assignments?',
  'Generate a quiz on this week’s topic',
  'Summarise where my classes need attention',
];

export async function chat({ user, message, history = [], classId = null }) {
  const context = await buildTeacherContext(user, { classId });
  const messages = [...history.slice(-8), { role: 'user', content: message }];

  const response = await complete({
    messages,
    system: SYSTEM_PROMPT,
    context,
    agent: 'teacher',
    temperature: 0.4,
  });

  return {
    ...response,
    context: { role: context.role, subject: context.subject, factCount: context.facts.length },
  };
}

/** Narrative class analysis for the reports page. */
export async function analyseClass({ user, classId }) {
  const context = await buildTeacherContext(user, { classId });

  const concerns = context.facts.filter((fact) => ['low', 'weak', 'pending'].includes(fact.flag));
  const summary = context.facts.filter((fact) => fact.topic === 'identity');

  return {
    overview: summary.map((fact) => fact.text),
    concerns: concerns.map((fact) => fact.text),
    recommendations: buildRecommendations(context),
  };
}

function buildRecommendations(context) {
  const recommendations = [];

  const lowAttendance = context.facts.filter((f) => f.topic === 'attendance' && f.flag === 'low');
  if (lowAttendance.length > 1) {
    recommendations.push(
      `${lowAttendance.length - 1} student(s) are below the attendance threshold. Contact their parents ` +
        'before the shortfall becomes unrecoverable — attendance is the hardest metric to fix late in a term.'
    );
  }

  const declining = context.facts.filter((f) => f.topic === 'performance' && f.flag === 'weak');
  if (declining.length) {
    recommendations.push(
      `${declining.length} student(s) show a downward trend. A short diagnostic quiz will tell you whether ` +
        'it is a specific topic gap or a broader engagement problem.'
    );
  }

  const pending = context.facts.find((f) => f.topic === 'assignments' && f.flag === 'pending');
  if (pending) {
    recommendations.push(
      'Ungraded submissions are queued. Grading promptly keeps the feedback loop tight enough to matter.'
    );
  }

  if (!recommendations.length) {
    recommendations.push('Your classes are tracking well — no attendance, performance or grading flags.');
  }

  return recommendations;
}

export default { chat, analyseClass, SUGGESTED_PROMPTS };
