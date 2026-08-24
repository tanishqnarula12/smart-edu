import { complete } from './aiService.js';
import { buildAdminContext } from './contextService.js';

/**
 * Admin agent (§33) — institutional analytics, trends and resource planning.
 * Admins have institution-wide read access, so this is the one agent whose
 * context is not narrowed by ownership.
 */

const SYSTEM_PROMPT = `You are the Smart Edu institutional analyst, advising a school administrator.

How to behave:
- Lead with the number, then the interpretation. Administrators want the figure first.
- Compare across classes and departments where the data supports it.
- When recommending action, be specific about which class, department or cohort.
- Distinguish clearly between what the data shows and what you are inferring from it.
- Never present the academic risk indicator as a prediction — it flags students for human review.`;

export const SUGGESTED_PROMPTS = [
  'Show institution attendance trends',
  'Which classes need attention?',
  'Analyse academic performance across departments',
  'Where should we focus resources this term?',
  'How many students are at risk and why?',
  'Which subjects have the weakest results?',
];

export async function chat({ user, message, history = [] }) {
  const context = await buildAdminContext();
  const messages = [...history.slice(-8), { role: 'user', content: message }];

  const response = await complete({
    messages,
    system: SYSTEM_PROMPT,
    context,
    agent: 'admin',
    temperature: 0.3,
  });

  return {
    ...response,
    context: { role: context.role, subject: context.subject, factCount: context.facts.length },
  };
}

/** Institutional briefing for the admin dashboard. */
export async function briefing() {
  const context = await buildAdminContext();

  const concerns = context.facts.filter((fact) => ['low', 'weak'].includes(fact.flag));
  const headline = context.facts.find((fact) => fact.topic === 'identity');

  return {
    headline: headline?.text ?? '',
    concerns: concerns.map((fact) => fact.text).slice(0, 5),
    priorities: buildPriorities(context),
  };
}

function buildPriorities(context) {
  const priorities = [];

  const attendance = context.facts.find((fact) => fact.topic === 'attendance' && fact.flag === 'low');
  if (attendance) {
    priorities.push({
      area: 'Attendance',
      detail: attendance.text,
      action: 'Review the low-attendance list with class teachers and start parent contact this week.',
    });
  }

  const risk = context.facts.find((fact) => fact.topic === 'risk');
  if (risk) {
    priorities.push({
      area: 'At-risk students',
      detail: risk.text,
      action: 'Assign each high-risk student a named staff member for a check-in conversation.',
    });
  }

  const engagement = context.facts.find((fact) => fact.topic === 'engagement');
  if (engagement) {
    priorities.push({
      area: 'Open cases',
      detail: engagement.text,
      action: 'Clear the complaint and leave queues — response time is what students judge the process by.',
    });
  }

  return priorities;
}

export default { chat, briefing, SUGGESTED_PROMPTS };
