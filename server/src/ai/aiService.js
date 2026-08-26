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
  // The "-latest" alias tracks whichever lite flash model Google currently
  // serves, so this stops working only if Google removes the whole tier —
  // not every time they retire one dated model in favour of the next
  // (gemini-2.0-flash and gemini-1.5-flash both 404 as of this writing).
  // "Lite" is deliberate: it carries the most generous free-tier quota of
  // the family, which is the constraint this integration is optimised for.
  gemini: 'gemini-flash-lite-latest',
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

// ─────────────────────────── GEMINI PROVIDER ──────────────────────────────

/**
 * Google's Generative Language API.
 *
 * Two things distinguish it from the OpenAI/Anthropic shapes above:
 *  - The system prompt is its own top-level field, not a message in the list.
 *  - Roles are "user" / "model", not "user" / "assistant".
 *
 * The API key goes in the `x-goog-api-key` header rather than the URL, so it
 * never ends up in a logged request line.
 */
async function geminiComplete({ messages, system, temperature, maxTokens }) {
  const baseUrl = config.ai.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
  const model = config.ai.model || DEFAULT_MODELS.gemini;

  const response = await fetch(`${baseUrl}/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.ai.apiKey },
    body: JSON.stringify({
      systemInstruction: system ? { parts: [{ text: system }] } : undefined,
      contents: messages.map((message) => ({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: message.content }],
      })),
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new AiError(`Gemini request failed (${response.status}): ${detail.slice(0, 200)}`, {
      // A quota-exhausted free tier returns 429 — that is exactly the
      // condition this integration is built to degrade gracefully from.
      retryable: response.status >= 500 || response.status === 429,
    });
  }

  const data = await response.json();
  const candidate = data.candidates?.[0];

  // A safety block or an empty generation leaves `candidates` empty rather
  // than erroring — treat that as a failure so it falls back to the mock
  // provider instead of returning a blank chat bubble.
  if (!candidate) {
    const reason = data.promptFeedback?.blockReason ?? 'no candidates returned';
    throw new AiError(`Gemini returned nothing (${reason})`, { retryable: false });
  }

  return {
    content: candidate.content?.parts?.map((part) => part.text).join('') ?? '',
    provider: 'gemini',
    model,
    usage: {
      promptTokens: data.usageMetadata?.promptTokenCount ?? 0,
      completionTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
    },
  };
}

// ─────────────────────────── OLLAMA PROVIDER ──────────────────────────────

/**
 * A local model via Ollama (https://ollama.com) — a second tier between a
 * failed cloud call and the templated mock. Opt-in via `AI_OLLAMA_FALLBACK`.
 *
 * The appeal here is specific: a free-tier cloud quota fails in exactly the
 * way that makes "just retry" useless (the daily limit is the daily limit),
 * but a local model has no quota at all. Requires `ollama pull <model>` and
 * the Ollama service running locally — if it isn't, this fails fast and the
 * caller falls through to the mock provider same as always.
 */
async function ollamaComplete({ messages, system, temperature, maxTokens }) {
  const baseUrl = config.ai.ollamaBaseUrl;
  const model = config.ai.ollamaModel;

  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        ...messages.map((message) => ({ role: message.role, content: message.content })),
      ],
      stream: false,
      options: { temperature, num_predict: maxTokens },
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new AiError(`Ollama request failed (${response.status}): ${detail.slice(0, 200)}`, {
      retryable: false,
    });
  }

  const data = await response.json();
  return {
    content: data.message?.content ?? '',
    provider: 'ollama',
    model,
    usage: {
      promptTokens: data.prompt_eval_count ?? 0,
      completionTokens: data.eval_count ?? 0,
    },
  };
}

const PROVIDERS = {
  mock: mockComplete,
  openai: openaiComplete,
  anthropic: anthropicComplete,
  gemini: geminiComplete,
  ollama: ollamaComplete,
};

// ────────────────────────────── GATEWAY ───────────────────────────────────

// Ollama authenticates by "is it running on this machine", not a key — every
// other live provider needs one. Centralised here so the three places that
// used to check `config.ai.apiKey` directly can't drift out of sync on this.
const needsApiKey = (provider) => provider !== 'mock' && provider !== 'ollama';

/** Is a real provider actually usable right now? */
export function isLiveProvider() {
  const provider = config.ai.provider;
  if (provider === 'mock') return false;
  return needsApiKey(provider) ? Boolean(config.ai.apiKey) : true;
}

export function providerInfo() {
  return {
    provider: config.ai.provider,
    live: isLiveProvider(),
    model: config.ai.model || DEFAULT_MODELS[config.ai.provider] || 'smart-edu-mock',
    fallbackActive: needsApiKey(config.ai.provider) && !config.ai.apiKey,
    ollamaFallback: config.ai.provider !== 'ollama' && config.ai.ollamaFallback,
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
  // Deliberately lean: the live check that validated this integration got a
  // complete, well-formed answer in 100 output tokens. 700 leaves headroom
  // for a longer explanation without inviting the model to pad — every
  // wasted token is quota on a free tier, and callers that genuinely need
  // more (the study plan generator) pass their own value.
  maxTokens = 700,
}) {
  const provider = config.ai.provider;

  // A configured provider with no key falls back rather than failing (§58).
  // Ollama is exempt — it authenticates by running locally, not by key.
  if (needsApiKey(provider) && !config.ai.apiKey) {
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

  // Only live providers pay for context in tokens, so only they get the
  // trimmed rendering — the mock provider keeps working from the full
  // `context.facts` array regardless.
  const systemPrompt = context ? `${system}\n\n${renderContext(context)}` : system;
  const trimmedMessages = trimHistory(messages);

  try {
    return await handler({ messages: trimmedMessages, system: systemPrompt, temperature, maxTokens });
  } catch (primaryError) {
    console.error(`[ai] ${provider} call failed:`, primaryError.message);

    // Optional second tier before giving up to the mock: a local model on
    // the operator's own machine. It has no quota to exhaust, which is
    // exactly the failure mode a free-tier cloud provider hits — "try
    // again" doesn't help when the problem is a daily limit, but a local
    // model sidesteps the limit entirely. Skipped when Ollama itself is the
    // primary provider (nothing to fall back to) or the flag is off.
    if (config.ai.ollamaFallback && provider !== 'ollama') {
      try {
        const result = await ollamaComplete({
          messages: trimmedMessages,
          system: systemPrompt,
          temperature,
          maxTokens,
        });
        console.warn(`[ai] ${provider} unavailable — answered by local Ollama (${result.model})`);
        return {
          ...result,
          fallback: true,
          fallbackReason: `${provider} unavailable — answered by a local model instead`,
        };
      } catch (ollamaError) {
        console.error('[ai] Ollama fallback also unavailable:', ollamaError.message);
      }
    }

    // Both live tiers are unavailable — degrade to the grounded mock answer
    // instead of showing the user an error page.
    return {
      ...mockComplete({ messages, context, agent }),
      fallback: true,
      fallbackReason: primaryError.message,
    };
  }
}

/**
 * Turn the structured context into prompt text — for a LIVE provider.
 *
 * The instruction line matters: it tells the model that this block is the only
 * data it may use, which is the prompt-side half of the authorization boundary
 * enforced in contextService.js.
 *
 * The agent builders in contextService.js can produce a genuinely large fact
 * list — an admin context walks every department and the last several months
 * of trend data. That richness is free for the mock provider, which just
 * narrates from the array, but every line here is billed input tokens on a
 * live provider. `maxFacts` keeps the prompt bounded regardless of how much
 * the builder assembled; the facts arrays are already ordered by relevance
 * (worst attendance first, lowest scores first), so truncating takes the
 * least useful tail, not a random sample.
 */
export function renderContext(context, { maxFacts = 22, factCharLimit = 200, docCharLimit = 350 } = {}) {
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

  const facts = context.facts ?? [];
  const shown = facts.slice(0, maxFacts);

  for (const fact of shown) {
    const text = fact.text.length > factCharLimit ? `${fact.text.slice(0, factCharLimit)}…` : fact.text;
    lines.push(`- [${fact.topic}] ${text}`);
  }
  if (facts.length > shown.length) {
    lines.push(`- (${facts.length - shown.length} more record(s) omitted for brevity)`);
  }

  if (context.documents?.length) {
    lines.push('', '## Retrieved study material');
    for (const doc of context.documents) {
      lines.push(`- (${doc.title}) ${doc.content.slice(0, docCharLimit)}`);
    }
  }

  return lines.join('\n');
}

/**
 * Cap conversation history sent to a live provider: the last few turns, each
 * truncated. A long-running chat's early messages add tokens to every
 * subsequent request without adding much — the model answers the current
 * question, not a transcript of the whole conversation.
 */
export function trimHistory(messages, { keep = 6, maxChars = 500 } = {}) {
  return messages.slice(-keep).map((message) => ({
    role: message.role,
    content:
      message.content.length > maxChars
        ? `${message.content.slice(0, maxChars)}…`
        : message.content,
  }));
}

export { AiError };

export default { complete, providerInfo, isLiveProvider, renderContext, AiError };
