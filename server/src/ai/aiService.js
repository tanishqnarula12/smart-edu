import { config } from '../config/env.js';

/**
 * Provider-neutral AI gateway (§33, §58).
 *
 * Agents call `complete()` and never learn which provider answered. With
 * `AI_PROVIDER=mock` — the default — the mock provider composes a reply from
 * the real database context the agent already assembled, so the whole product
 * is demonstrable with no API key and nothing crashes for want of credentials.
 *
 * Adding a provider means adding one entry to PROVIDERS. Nothing else changes.
 */

const DEFAULT_MODELS = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-sonnet-4-5',
};

class AiError extends Error {
  constructor(message, { retryable = false } = {}) {
    super(message);
    this.name = 'AiError';
    this.retryable = retryable;
  }
}

// ─────────────────────────── MOCK PROVIDER ────────────────────────────────

/**
 * Deterministic, data-grounded responses.
 *
 * The agent hands us a structured `context` block drawn from PostgreSQL under
 * the caller's own permissions. The mock provider narrates that data rather
 * than inventing anything, so demo answers are actually true.
 */
function mockComplete({ messages, context, agent }) {
  const question = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
  const composed = composeMockAnswer({ question, context, agent });

  return {
    content: composed,
    provider: 'mock',
    model: 'smart-edu-mock',
    usage: { promptTokens: 0, completionTokens: 0 },
    grounded: Boolean(context?.facts?.length),
  };
}

function composeMockAnswer({ question, context, agent }) {
  const facts = context?.facts ?? [];
  const lower = question.toLowerCase();

  // Pick the facts that actually relate to what was asked; fall back to a
  // general summary when nothing matches.
  const keywords = {
    attendance: ['attendance', 'absent', 'present', 'attend', 'miss'],
    performance: ['mark', 'score', 'grade', 'cgpa', 'perform', 'result', 'exam', 'rank'],
    assignments: ['assignment', 'homework', 'submit', 'due', 'deadline', 'pending'],
    improvement: ['improve', 'better', 'help', 'weak', 'struggle', 'focus', 'study'],
    schedule: ['timetable', 'schedule', 'class', 'today', 'when'],
  };

  const topics = Object.entries(keywords)
    .filter(([, words]) => words.some((word) => lower.includes(word)))
    .map(([topic]) => topic);

  const relevant = topics.length
    ? facts.filter((fact) => topics.includes(fact.topic))
    : facts;

  const lines = [];
  const body = (relevant.length ? relevant : facts).slice(0, 8);

  if (!body.length) {
    return (
      `I don't have enough information in your records yet to answer that.\n\n` +
      `Once there is attendance, assessment or assignment data on the account I can ` +
      `give you a grounded answer. In the meantime, try asking about your timetable or upcoming work.`
    );
  }

  lines.push(intro(agent, topics));
  lines.push('');
  for (const fact of body) {
    lines.push(`- ${fact.text}`);
  }

  const advice = suggestions(topics, facts, agent);
  if (advice.length) {
    lines.push('');
    lines.push(agent === 'parent' ? '**How you can help**' : '**Suggested next steps**');
    for (const item of advice) lines.push(`- ${item}`);
  }

  lines.push('');
  lines.push(
    '_Generated from your Smart Edu records by the built-in assistant. ' +
      'Configure `AI_PROVIDER` with an API key for full conversational answers._'
  );

  return lines.join('\n');
}

function intro(agent, topics) {
  const topic = topics[0];
  const intros = {
    student: {
      attendance: "Here's where your attendance stands:",
      performance: "Here's how your results look right now:",
      assignments: "Here's your assignment position:",
      improvement: "Based on your records, here's where to focus:",
      schedule: "Here's what your schedule looks like:",
      default: "Here's a summary from your academic record:",
    },
    parent: {
      attendance: "Here's your child's attendance picture:",
      performance: "Here's how your child is performing:",
      assignments: "Here's the assignment position:",
      improvement: 'Here are the areas worth supporting at home:',
      default: "Here's a summary of what you can see:",
    },
    teacher: {
      attendance: "Here's the attendance picture for your classes:",
      performance: "Here's how your classes are performing:",
      default: "Here's a summary of your classes:",
    },
    admin: {
      default: "Here's the institutional picture:",
    },
  };

  const set = intros[agent] ?? intros.student;
  return set[topic] ?? set.default;
}

function suggestions(topics, facts, agent) {
  const output = [];
  const find = (topic) => facts.filter((fact) => fact.topic === topic);

  const attendanceFacts = find('attendance');
  const lowAttendance = attendanceFacts.find((fact) => fact.flag === 'low');
  if (lowAttendance) {
    output.push(
      agent === 'parent'
        ? 'Attendance is below the 75% requirement — a conversation about what is getting in the way would help.'
        : 'Attendance is below the 75% requirement. Prioritise being in every remaining class this term.'
    );
  }

  const weak = find('performance').find((fact) => fact.flag === 'weak');
  if (weak) {
    output.push(
      agent === 'parent'
        ? `${weak.subject ?? 'One subject'} is the weakest area — ask the subject teacher what practice would help most.`
        : `Give ${weak.subject ?? 'your weakest subject'} extra practice time and ask your teacher for worked examples.`
    );
  }

  const pending = find('assignments').find((fact) => fact.flag === 'pending');
  if (pending) {
    output.push(
      agent === 'parent'
        ? 'There is outstanding work — checking the assignment list together would be worthwhile.'
        : 'Clear the outstanding assignments first — they are the fastest marks available to you.'
    );
  }

  if (!output.length && (topics.includes('improvement') || !topics.length)) {
    output.push('Keep attendance above 75% and submit every assignment on time — those two habits carry most of the grade.');
  }

  return output.slice(0, 4);
}

// ────────────────────────── OPENAI PROVIDER ───────────────────────────────

async function openaiComplete({ messages, system, temperature, maxTokens }) {
  const baseUrl = config.ai.baseUrl || 'https://api.openai.com/v1';

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.ai.apiKey}`,
    },
    body: JSON.stringify({
      model: config.ai.model || DEFAULT_MODELS.openai,
      messages: [{ role: 'system', content: system }, ...messages],
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new AiError(`OpenAI request failed (${response.status}): ${detail.slice(0, 200)}`, {
      retryable: response.status >= 500 || response.status === 429,
    });
  }

  const data = await response.json();
  return {
    content: data.choices?.[0]?.message?.content ?? '',
    provider: 'openai',
    model: data.model,
    usage: {
      promptTokens: data.usage?.prompt_tokens ?? 0,
      completionTokens: data.usage?.completion_tokens ?? 0,
    },
  };
}

// ───────────────────────── ANTHROPIC PROVIDER ─────────────────────────────

async function anthropicComplete({ messages, system, temperature, maxTokens }) {
  const baseUrl = config.ai.baseUrl || 'https://api.anthropic.com/v1';

  const response = await fetch(`${baseUrl}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.ai.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.ai.model || DEFAULT_MODELS.anthropic,
      system,
      messages: messages.map((message) => ({ role: message.role, content: message.content })),
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new AiError(`Anthropic request failed (${response.status}): ${detail.slice(0, 200)}`, {
      retryable: response.status >= 500 || response.status === 429,
    });
  }

  const data = await response.json();
  return {
    content: data.content?.map((block) => block.text).join('') ?? '',
    provider: 'anthropic',
    model: data.model,
    usage: {
      promptTokens: data.usage?.input_tokens ?? 0,
      completionTokens: data.usage?.output_tokens ?? 0,
    },
  };
}

const PROVIDERS = {
  mock: mockComplete,
  openai: openaiComplete,
  anthropic: anthropicComplete,
};

// ────────────────────────────── GATEWAY ───────────────────────────────────

/** Is a real provider actually usable right now? */
export function isLiveProvider() {
  return config.ai.provider !== 'mock' && Boolean(config.ai.apiKey);
}

export function providerInfo() {
  return {
    provider: config.ai.provider,
    live: isLiveProvider(),
    model: config.ai.model || DEFAULT_MODELS[config.ai.provider] || 'smart-edu-mock',
    fallbackActive: config.ai.provider !== 'mock' && !config.ai.apiKey,
  };
}

/**
 * Run a completion.
 *
 * `context` is the authorised data block the agent assembled. It is both what
 * the mock provider narrates and what gets injected into a live provider's
 * system prompt — the same data either way, so behaviour does not diverge
 * between demo and production.
 */
export async function complete({
  messages,
  system = '',
  context = null,
  agent = 'student',
  temperature = 0.4,
  maxTokens = 1200,
}) {
  const provider = config.ai.provider;

  // A configured provider with no key falls back rather than failing (§58).
  if (provider !== 'mock' && !config.ai.apiKey) {
    console.warn(`[ai] AI_PROVIDER=${provider} but AI_API_KEY is empty — using the mock provider.`);
    return { ...mockComplete({ messages, context, agent }), fallback: true };
  }

  const handler = PROVIDERS[provider];
  if (!handler) {
    console.warn(`[ai] Unknown AI_PROVIDER "${provider}" — using the mock provider.`);
    return { ...mockComplete({ messages, context, agent }), fallback: true };
  }

  if (provider === 'mock') {
    return mockComplete({ messages, context, agent });
  }

  const systemPrompt = context ? `${system}\n\n${renderContext(context)}` : system;

  try {
    return await handler({ messages, system: systemPrompt, temperature, maxTokens });
  } catch (error) {
    // A provider outage degrades to the grounded mock answer instead of
    // showing the user an error page.
    console.error('[ai] provider call failed, falling back to mock:', error.message);
    return {
      ...mockComplete({ messages, context, agent }),
      fallback: true,
      fallbackReason: error.message,
    };
  }
}

/**
 * Turn the structured context into prompt text.
 *
 * The instruction line matters: it tells the model that this block is the only
 * data it may use, which is the prompt-side half of the authorization boundary
 * enforced in contextService.js.
 */
export function renderContext(context) {
  const lines = [
    '## Authorised data',
    'The block below is the ONLY information about this institution you may use.',
    'It has already been filtered to what this specific user is permitted to see.',
    'Never speculate about students, classes or records that do not appear here.',
    'If the answer is not derivable from this block, say so plainly.',
    '',
  ];

  if (context.subject) lines.push(`Subject of the question: ${context.subject}`);
  if (context.role) lines.push(`Asking as: ${context.role}`);
  lines.push('');

  for (const fact of context.facts ?? []) {
    lines.push(`- [${fact.topic}] ${fact.text}`);
  }

  if (context.documents?.length) {
    lines.push('', '## Retrieved study material');
    for (const doc of context.documents) {
      lines.push(`- (${doc.title}) ${doc.content.slice(0, 600)}`);
    }
  }

  return lines.join('\n');
}

export { AiError };

export default { complete, providerInfo, isLiveProvider, renderContext, AiError };
