import { complete } from './aiService.js';
import { buildStudentContext } from './contextService.js';
import { retrieve } from './ragService.js';

/**
 * Student agent (§33) — tutor, doubt-solver, study planner.
 *
 * Context is always the student's own record. There is no parameter by which
 * a student could point this agent at somebody else.
 */

const SYSTEM_PROMPT = `You are the Smart Edu study assistant, helping one student with their own academic work.

How to behave:
- Be encouraging, concrete and brief. Prefer specifics from their record over generic advice.
- When explaining a concept, build from what they already know and give a worked example.
- When asked about their performance, quote the actual figures from the authorised data.
- Never discuss, compare against, or reveal information about any other named student.
- If you are asked about another student, decline briefly and offer to help with their own work instead.
- If the data needed for an answer is not present, say so rather than guessing.`;

export const SUGGESTED_PROMPTS = [
  'How am I doing this term?',
  'Explain my weakest subject and how to improve it',
  'Create a study plan for the next two weeks',
  'What assignments do I have pending?',
  'Generate practice questions for my weakest topic',
  'Why is my attendance flagged?',
];

export async function chat({ user, message, history = [] }) {
  const context = await buildStudentContext(user);

  // Pull any study material the student is entitled to that matches the question.
  const documents = await retrieve({ user, query: message, topK: 3 });
  context.documents = documents;

  const messages = [...history.slice(-8), { role: 'user', content: message }];

  const response = await complete({
    messages,
    system: SYSTEM_PROMPT,
    context,
    agent: 'student',
    temperature: 0.5,
  });

  return { ...response, context: summarise(context), sources: documents };
}

/** Generate a study plan grounded in the student's weakest areas. */
export async function studyPlan({ user, days = 14 }) {
  const context = await buildStudentContext(user);

  const weak = context.facts.filter((fact) => fact.flag === 'weak' || fact.flag === 'low');
  const message =
    `Create a ${days}-day study plan for me. Prioritise my weakest subjects and any attendance ` +
    `or assignment problems. Give each day a focus, roughly 90 minutes of work, and a checkable outcome.` +
    (weak.length ? ` My known problem areas: ${weak.map((f) => f.text).join(' ')}` : '');

  const response = await complete({
    messages: [{ role: 'user', content: message }],
    system: `${SYSTEM_PROMPT}\n\nProduce a day-by-day plan as a markdown list. Keep it realistic.`,
    context,
    agent: 'student',
    temperature: 0.4,
    maxTokens: 1100,
  });

  // The mock provider does not write plans, so build a real one from the data.
  if (response.provider === 'mock') {
    return { ...response, content: buildDeterministicPlan(context, days), context: summarise(context) };
  }

  return { ...response, context: summarise(context) };
}

/**
 * A genuinely useful plan assembled from the student's own weak subjects —
 * used whenever no live AI provider is configured.
 */
function buildDeterministicPlan(context, days) {
  const subjects = context.facts
    .filter((fact) => fact.topic === 'performance' && fact.subject)
    .map((fact) => ({ subject: fact.subject, weak: fact.flag === 'weak' }));

  const unique = [...new Map(subjects.map((s) => [s.subject, s])).values()];
  const weakFirst = [...unique].sort((a, b) => Number(b.weak) - Number(a.weak));

  const pending = context.facts.filter((fact) => fact.flag === 'pending' && fact.topic === 'assignments');
  const lowAttendance = context.facts.some((fact) => fact.topic === 'attendance' && fact.flag === 'low');

  const lines = [`# Your ${days}-day study plan`, ''];

  if (lowAttendance) {
    lines.push(
      '> **Attendance first.** You are below the 75% requirement. Every class you attend from here ' +
        'raises the figure — no amount of revision replaces that.',
      ''
    );
  }

  if (pending.length) {
    lines.push('## Clear these first', '');
    for (const item of pending.slice(0, 5)) lines.push(`- ${item.text.replace('Outstanding: ', '')}`);
    lines.push('');
  }

  lines.push('## Daily schedule', '');

  if (!weakFirst.length) {
    lines.push(
      'There are no published results yet, so this plan keeps a steady rotation across your timetable. ' +
        'Once marks appear, ask again and the plan will target your weakest subjects.'
    );
    return lines.join('\n');
  }

  for (let day = 1; day <= days; day += 1) {
    const focus = weakFirst[(day - 1) % weakFirst.length];
    const isReview = day % 7 === 0;

    if (isReview) {
      lines.push(`**Day ${day} — Review & self-test**`);
      lines.push(`- 45 min: redo the week's hardest problems without notes`);
      lines.push(`- 30 min: write a one-page summary of each topic covered`);
      lines.push(`- 15 min: list what is still unclear and bring it to your teacher`);
    } else {
      lines.push(`**Day ${day} — ${focus.subject}${focus.weak ? ' (priority)' : ''}**`);
      lines.push(`- 30 min: re-read notes and the textbook section, writing down every term you cannot define`);
      lines.push(`- 45 min: work through practice problems, hardest first`);
      lines.push(`- 15 min: check answers and note every mistake with *why* it was wrong`);
    }
    lines.push('');
  }

  lines.push(
    '---',
    '',
    '**How to use this:** the 15-minute mistake review at the end of each day is the part that ' +
      'actually moves your marks. Do not skip it.'
  );

  return lines.join('\n');
}

/** Weak-topic analysis for the progress page. */
export async function analyseWeakTopics({ user }) {
  const context = await buildStudentContext(user);

  const weak = context.facts.filter(
    (fact) => (fact.topic === 'performance' || fact.topic === 'attendance') && (fact.flag === 'weak' || fact.flag === 'low')
  );
  const strong = context.facts.filter((fact) => fact.flag === 'strong');

  return {
    strengths: strong.map((fact) => fact.text),
    weaknesses: weak.map((fact) => fact.text),
    insights: buildInsights(context),
  };
}

/** The "You're performing well in… / You should focus on…" block (§37). */
function buildInsights(context) {
  const insights = [];
  const find = (predicate) => context.facts.find(predicate);

  const strong = find((fact) => fact.flag === 'strong');
  if (strong) insights.push({ tone: 'positive', title: "You're performing well in", body: strong.text });

  const weak = find((fact) => fact.flag === 'weak');
  if (weak) insights.push({ tone: 'warning', title: 'You should focus more on', body: weak.text });

  const attendance = find((fact) => fact.topic === 'attendance' && fact.flag);
  if (attendance) {
    insights.push({
      tone: attendance.flag === 'low' ? 'warning' : 'positive',
      title: 'Your attendance',
      body: attendance.text,
    });
  }

  const assignments = find((fact) => fact.topic === 'assignments' && fact.flag === 'pending');
  if (assignments) {
    insights.push({ tone: 'warning', title: 'Outstanding work', body: assignments.text });
  } else {
    insights.push({
      tone: 'positive',
      title: 'Assignments',
      body: 'You have no outstanding assignments — keep it that way.',
    });
  }

  return insights;
}

const summarise = (context) => ({
  role: context.role,
  subject: context.subject,
  factCount: context.facts.length,
});

export default { chat, studyPlan, analyseWeakTopics, SUGGESTED_PROMPTS };
