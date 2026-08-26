import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Sparkles, Send, Copy, Check, RotateCcw, Trash2, Plus, MessageSquare, Info, Loader2,
} from 'lucide-react';
import { aiApi } from '../services/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Avatar } from './ui/Misc.jsx';
import { Button, IconButton } from './ui/Button.jsx';
import { Badge } from './ui/Badge.jsx';
import { cn } from '../utils/cn.js';
import { formatRelative } from '../utils/format.js';

/**
 * AI chat interface (§57).
 *
 * Shared by all four roles — the backend picks the agent from the caller's
 * role, so this component never needs to know which one is answering.
 */
export function AIChat({ contextParams = {}, className, title, description, compact = false }) {
  const { user, role } = useAuth();
  const toast = useToast();

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [provider, setProvider] = useState(null);
  const [copiedIndex, setCopiedIndex] = useState(null);

  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const lastUserMessage = useRef(null);

  // Load starter prompts and provider status once.
  useEffect(() => {
    aiApi
      .suggestions()
      .then((data) => {
        setSuggestions(data.suggestions ?? []);
        setProvider(data.provider ?? null);
      })
      .catch(() => {});

    aiApi.conversations().then(setConversations).catch(() => {});
  }, []);

  // Keep the newest message in view as the conversation grows.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isSending]);

  const send = useCallback(
    async (text) => {
      const trimmed = text.trim();
      if (!trimmed || isSending) return;

      lastUserMessage.current = trimmed;
      setInput('');
      setMessages((current) => [...current, { role: 'user', content: trimmed }]);
      setIsSending(true);

      try {
        const data = await aiApi.chat({
          message: trimmed,
          conversationId,
          context: contextParams,
        });

        setConversationId(data.conversationId);
        setMessages((current) => [
          ...current,
          {
            role: 'assistant',
            content: data.message,
            provider: data.provider,
            fallback: data.fallback,
            fallbackReason: data.fallbackReason,
            sources: data.sources,
          },
        ]);

        // Refresh the sidebar list once a conversation has been created.
        aiApi.conversations().then(setConversations).catch(() => {});
      } catch (error) {
        setMessages((current) => [
          ...current,
          {
            role: 'assistant',
            content: `I couldn't answer that: ${error.message}`,
            isError: true,
          },
        ]);
        toast.error(error.message);
      } finally {
        setIsSending(false);
        inputRef.current?.focus();
      }
    },
    [conversationId, contextParams, isSending, toast]
  );

  const regenerate = () => {
    if (!lastUserMessage.current) return;
    // Drop the previous answer so the new one replaces it rather than stacking.
    setMessages((current) => {
      const lastAssistant = current.map((m) => m.role).lastIndexOf('assistant');
      return lastAssistant === -1 ? current : current.slice(0, lastAssistant);
    });
    send(lastUserMessage.current);
  };

  const copy = async (text, index) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 1800);
    } catch {
      toast.error('Could not copy to the clipboard');
    }
  };

  const startNew = () => {
    setMessages([]);
    setConversationId(null);
    lastUserMessage.current = null;
    inputRef.current?.focus();
  };

  const openConversation = async (id) => {
    try {
      const data = await aiApi.conversation(id);
      setConversationId(id);
      setMessages(
        data.messages.map((message) => ({
          role: message.role,
          content: message.content,
          provider: message.metadata?.provider,
          fallback: message.metadata?.fallback,
          fallbackReason: message.metadata?.fallbackReason,
        }))
      );
    } catch (error) {
      toast.error(error.message);
    }
  };

  const removeConversation = async (id, event) => {
    event.stopPropagation();
    try {
      await aiApi.deleteConversation(id);
      setConversations((current) => current.filter((conversation) => conversation.id !== id));
      if (id === conversationId) startNew();
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleKeyDown = (event) => {
    // Enter sends; Shift-Enter is a newline.
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send(input);
    }
  };

  return (
    <div className={cn('flex gap-5', className)}>
      {/* Conversation history */}
      {!compact && (
        <aside className="hidden w-60 shrink-0 flex-col xl:flex">
          <Button icon={Plus} variant="secondary" fullWidth onClick={startNew}>
            New conversation
          </Button>

          <div className="scrollbar-slim mt-3 flex-1 space-y-1 overflow-y-auto">
            {conversations.length === 0 ? (
              <p className="px-2 py-4 text-xs text-ink-subtle">
                Your past conversations will appear here.
              </p>
            ) : (
              conversations.map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => openConversation(conversation.id)}
                  className={cn(
                    'group flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition',
                    conversation.id === conversationId
                      ? 'bg-brand-50 dark:bg-brand-950/40'
                      : 'hover:bg-surface-sunken'
                  )}
                >
                  <MessageSquare
                    size={14}
                    className="mt-0.5 shrink-0 text-ink-subtle"
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-ink">
                      {conversation.title}
                    </span>
                    <span className="block text-[10px] text-ink-subtle">
                      {formatRelative(conversation.updated_at)}
                    </span>
                  </span>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(event) => removeConversation(conversation.id, event)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') removeConversation(conversation.id, event);
                    }}
                    aria-label="Delete conversation"
                    className="shrink-0 rounded p-0.5 text-ink-subtle opacity-0 transition hover:text-danger-600 group-hover:opacity-100"
                  >
                    <Trash2 size={12} />
                  </span>
                </button>
              ))
            )}
          </div>
        </aside>
      )}

      {/* Chat panel */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-surface-raised shadow-card">
        <div className="flex items-center gap-3 border-b border-line p-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-violet-600 text-white">
            <Sparkles size={17} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold text-ink">
              {title ?? 'Smart Edu assistant'}
            </h2>
            <p className="truncate text-xs text-ink-muted">
              {description ?? 'Grounded in your own records'}
            </p>
          </div>

          {provider && (
            <Badge tone={provider.live ? 'success' : 'neutral'} size="sm">
              {provider.live ? provider.provider : 'built-in'}
            </Badge>
          )}

          {messages.length > 0 && (
            <IconButton icon={RotateCcw} label="Start a new conversation" size="sm" onClick={startNew} />
          )}
        </div>

        {/* Messages */}
        <div
          ref={scrollRef}
          className="scrollbar-slim flex-1 space-y-5 overflow-y-auto p-4 sm:p-5"
          style={{ minHeight: compact ? 280 : 420, maxHeight: compact ? 380 : '58vh' }}
        >
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center py-6 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-violet-600 text-white shadow-sm">
                <Sparkles size={24} aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-base font-semibold text-ink">
                {role === 'student'
                  ? 'Ask me about your studies'
                  : role === 'parent'
                    ? "Ask about your child's progress"
                    : role === 'teacher'
                      ? 'Ask about your classes'
                      : 'Ask about the institution'}
              </h3>
              <p className="mt-1.5 max-w-sm text-sm text-ink-muted">
                Every answer is built from records you are permitted to see — nothing more.
              </p>

              {suggestions.length > 0 && (
                <div className="mt-6 flex w-full max-w-lg flex-wrap justify-center gap-2">
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => send(suggestion)}
                      className="rounded-full border border-line bg-surface-sunken px-3.5 py-2 text-xs font-medium text-ink-muted transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 dark:hover:bg-brand-950/40"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            messages.map((message, index) => (
              <div
                key={index}
                className={cn('flex gap-3', message.role === 'user' && 'flex-row-reverse')}
              >
                {message.role === 'user' ? (
                  <Avatar name={user?.name} src={user?.avatarUrl} size="sm" />
                ) : (
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-violet-600 text-white">
                    <Sparkles size={14} aria-hidden="true" />
                  </span>
                )}

                <div className={cn('min-w-0 max-w-[85%]', message.role === 'user' && 'items-end')}>
                  <div
                    className={cn(
                      'rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                      message.role === 'user'
                        ? 'rounded-tr-sm bg-brand-600 text-white'
                        : message.isError
                          ? 'rounded-tl-sm border border-danger-500/25 bg-danger-50 text-danger-700 dark:bg-danger-500/10'
                          : 'rounded-tl-sm bg-surface-sunken text-ink'
                    )}
                  >
                    <MarkdownLite content={message.content} />
                  </div>

                  {message.role === 'assistant' && !message.isError && (
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => copy(message.content, index)}
                        className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-ink-subtle transition hover:bg-surface-sunken hover:text-ink"
                      >
                        {copiedIndex === index ? (
                          <>
                            <Check size={11} aria-hidden="true" /> Copied
                          </>
                        ) : (
                          <>
                            <Copy size={11} aria-hidden="true" /> Copy
                          </>
                        )}
                      </button>

                      {index === messages.length - 1 && (
                        <button
                          type="button"
                          onClick={regenerate}
                          disabled={isSending}
                          className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-ink-subtle transition hover:bg-surface-sunken hover:text-ink disabled:opacity-50"
                        >
                          <RotateCcw size={11} aria-hidden="true" /> Regenerate
                        </button>
                      )}

                      {message.sources?.length > 0 && (
                        <span className="text-[11px] text-ink-subtle">
                          · {message.sources.length} source
                          {message.sources.length === 1 ? '' : 's'}
                        </span>
                      )}

                      {/* This specific reply degraded from the configured provider — usually
                          a live provider's quota running out mid-conversation. Surfaced
                          per-message rather than once, since the header badge reflects
                          the provider's configured state, not what actually answered.
                          Ollama answering is a genuinely different (better) outcome than
                          the templated mock, so the two get distinct labels. */}
                      {message.fallback && (
                        <span
                          className="text-[11px] text-warning-600"
                          title={message.fallbackReason || 'The configured AI provider was unavailable for this reply'}
                        >
                          · {message.provider === 'ollama' ? 'local model' : 'built-in assistant'}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}

          {/* Typing indicator */}
          {isSending && (
            <div className="flex gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-violet-600 text-white">
                <Sparkles size={14} aria-hidden="true" />
              </span>
              <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm bg-surface-sunken px-4 py-3.5">
                {[0, 150, 300].map((delay) => (
                  <span
                    key={delay}
                    className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-subtle"
                    style={{ animationDelay: `${delay}ms` }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="border-t border-line p-3 sm:p-4">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder="Ask a question…"
              aria-label="Message"
              className="scrollbar-slim max-h-32 min-h-[42px] flex-1 resize-none rounded-xl border border-line bg-surface-sunken px-3.5 py-2.5 text-sm text-ink transition placeholder:text-ink-subtle focus:border-brand-500 focus:bg-surface-raised focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              style={{ height: 'auto' }}
              onInput={(event) => {
                event.target.style.height = 'auto';
                event.target.style.height = `${Math.min(event.target.scrollHeight, 128)}px`;
              }}
            />

            <Button
              onClick={() => send(input)}
              disabled={!input.trim() || isSending}
              icon={isSending ? Loader2 : Send}
              className="h-[42px] shrink-0"
              aria-label="Send message"
            >
              <span className="hidden sm:inline">Send</span>
            </Button>
          </div>

          {provider && !provider.live && (
            <p className="mt-2 flex items-start gap-1.5 text-[11px] text-ink-subtle">
              <Info size={11} className="mt-0.5 shrink-0" aria-hidden="true" />
              Running the built-in assistant. Answers are composed from your real records; set
              <code className="mx-1 rounded bg-surface-sunken px-1 font-mono">AI_PROVIDER</code>
              with an API key for full conversational replies.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Minimal markdown renderer for chat output — headings, bold, italics, code,
 * bullets and blockquotes. Text is escaped first, so a model response cannot
 * inject markup.
 */
function MarkdownLite({ content }) {
  const escape = (text) =>
    text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  const inline = (text) =>
    escape(text)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
      .replace(/_([^_]+)_/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code class="rounded bg-black/10 px-1 py-0.5 font-mono text-[0.9em]">$1</code>');

  const lines = String(content ?? '').split('\n');
  const blocks = [];
  let listBuffer = [];

  const flushList = () => {
    if (!listBuffer.length) return;
    blocks.push(
      <ul key={`list-${blocks.length}`} className="my-2 list-disc space-y-1 pl-5">
        {listBuffer.map((item, index) => (
          <li key={index} dangerouslySetInnerHTML={{ __html: inline(item) }} />
        ))}
      </ul>
    );
    listBuffer = [];
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    if (/^[-*]\s+/.test(trimmed)) {
      listBuffer.push(trimmed.replace(/^[-*]\s+/, ''));
      return;
    }

    flushList();

    if (!trimmed) {
      blocks.push(<div key={`gap-${index}`} className="h-2" />);
    } else if (/^#{1,3}\s/.test(trimmed)) {
      const level = trimmed.match(/^#+/)[0].length;
      const text = trimmed.replace(/^#+\s/, '');
      blocks.push(
        <p
          key={index}
          className={cn('mt-3 font-semibold first:mt-0', level === 1 ? 'text-base' : 'text-sm')}
          dangerouslySetInnerHTML={{ __html: inline(text) }}
        />
      );
    } else if (/^>\s?/.test(trimmed)) {
      blocks.push(
        <blockquote
          key={index}
          className="my-2 border-l-2 border-current/30 pl-3 opacity-80"
          dangerouslySetInnerHTML={{ __html: inline(trimmed.replace(/^>\s?/, '')) }}
        />
      );
    } else if (/^---+$/.test(trimmed)) {
      blocks.push(<hr key={index} className="my-3 border-current/15" />);
    } else {
      blocks.push(<p key={index} dangerouslySetInnerHTML={{ __html: inline(trimmed) }} />);
    }
  });

  flushList();

  return <div className="space-y-0.5">{blocks}</div>;
}

export default AIChat;
