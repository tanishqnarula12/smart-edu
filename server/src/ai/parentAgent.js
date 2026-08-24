import { complete } from './aiService.js';
import { buildParentContext } from './contextService.js';

/**
 * Parent agent (§17, §34).
 *
 * The context builder has already dropped every category the student withheld,
 * so this agent physically cannot report on data it was not given. The system
 * prompt tells it how to talk about that gap honestly.
 */

const SYSTEM_PROMPT = `You are the Smart Edu assistant, helping a parent understand how their child is doing.

How to behave:
- Speak plainly and supportively. Parents are not educators; avoid jargon.
- Ground every claim in the authorised data. Quote real figures.
- Where a category is marked as not shared, say the student has chosen not to share it and move on.
  Do not speculate about what the hidden data might contain, and do not treat it as bad news.
- Never mention or compare against any other student, named or otherwise.
- When asked how to help, give two or three specific, practical actions for home.
- Be honest about problems, but frame them as addressable.`;

export const SUGGESTED_PROMPTS = [
  'How is my child performing?',
  'Why did the attendance drop?',
  'Which subjects need improvement?',
  'What assignments are pending?',
  'When is the next exam?',
  'How can I help my child improve?',
];

export async function chat({ user, message, history = [], studentId = null }) {
  const context = await buildParentContext(user, studentId);
  const messages = [...history.slice(-8), { role: 'user', content: message }];

  const response = await complete({
    messages,
    system: SYSTEM_PROMPT,
    context,
    agent: 'parent',
    temperature: 0.4,
  });

  return {
    ...response,
    context: {
      role: context.role,
      subject: context.subject,
      factCount: context.facts.length,
      restrictedTopics: context.facts.filter((f) => f.flag === 'restricted').map((f) => f.topic),
    },
    child: context.child
      ? { id: context.child.id, name: context.child.name, permissions: context.child.permissions }
      : null,
  };
}

/** A short narrative summary for the parent dashboard header. */
export async function summarise({ user, studentId = null }) {
  const context = await buildParentContext(user, studentId);

  if (!context.child) {
    return { summary: 'No children are linked to your account yet.', highlights: [], concerns: [] };
  }

  const highlights = [];
  const concerns = [];

  for (const fact of context.facts) {
    if (fact.flag === 'low' || fact.flag === 'weak' || fact.flag === 'pending') concerns.push(fact.text);
    else if (fact.flag === 'strong' || fact.flag === 'ok') highlights.push(fact.text);
  }

  const restricted = context.facts.filter((fact) => fact.flag === 'restricted');

  const summary = concerns.length
    ? `${context.child.name} needs attention in ${concerns.length} area(s). ${concerns[0]}`
    : `${context.child.name} is on track across the areas you can see.`;

  return {
    summary,
    highlights: highlights.slice(0, 4),
    concerns: concerns.slice(0, 4),
    restricted: restricted.map((fact) => fact.text),
  };
}

export default { chat, summarise, SUGGESTED_PROMPTS };
