import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bot,
  Bug,
  Briefcase,
  Code2,
  GraduationCap,
  MessageSquare,
  Network,
  Plus,
  Send,
  Square,
  Trash2,
  BookOpen,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  MENTOR_TOPICS,
  type CitationDto,
  type ConversationDto,
  type ConversationSummaryDto,
  type MentorMessageDto,
  type MentorTopic,
} from '@devhub/shared';
import { api, errorMessage } from '../lib/api';
import { qk } from '../lib/queryClient';
import { streamEvents } from '../lib/sse';
import { useAuth } from '../auth/context';
import { useDocumentTitle } from '../lib/hooks';
import { cn, timeAgo } from '../lib/utils';
import { Markdown } from '../components/Markdown';
import { Avatar, Card, Skeleton } from '../components/ui/primitives';
import { Button } from '../components/ui/Button';
import { Textarea } from '../components/ui/Field';

const TOPIC_META: Record<MentorTopic, { label: string; icon: typeof Bot; prompt: string }> = {
  general: {
    label: 'General',
    icon: MessageSquare,
    prompt: 'Explain the difference between processes and threads with an example.',
  },
  debugging: {
    label: 'Debugging',
    icon: Bug,
    prompt: 'My Node.js API gets slower over time until I restart it. How do I find out why?',
  },
  'code-review': {
    label: 'Code review',
    icon: Code2,
    prompt: 'Review this function for bugs and readability: …',
  },
  learning: {
    label: 'Learning path',
    icon: GraduationCap,
    prompt:
      'I know JavaScript basics. Give me a 3-month plan to become job-ready in full-stack TypeScript.',
  },
  career: {
    label: 'Career',
    icon: Briefcase,
    prompt: 'How should I prepare for a low-level design interview?',
  },
  'system-design': {
    label: 'System design',
    icon: Network,
    prompt: 'Design a URL shortener that handles 10k writes per second.',
  },
};

export default function Mentor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState<{
    text: string;
    model: string;
    sources: CitationDto[];
  } | null>(null);
  const [useCommunity, setUseCommunity] = useState(true);
  const abortRef = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  useDocumentTitle('AI Mentor');

  const { data: status } = useQuery({
    queryKey: qk.aiStatus,
    queryFn: () => api<{ isDemo: boolean }>('/ai/status'),
    staleTime: Infinity,
  });
  const conversations = useQuery({
    queryKey: qk.conversations,
    queryFn: () => api<ConversationSummaryDto[]>('/ai/conversations'),
  });
  const convo = useQuery({
    queryKey: qk.conversation(id ?? ''),
    queryFn: () => api<ConversationDto>(`/ai/conversations/${id}`),
    enabled: Boolean(id),
  });

  const create = useMutation({
    mutationFn: (topic: MentorTopic) =>
      api<ConversationSummaryDto>('/ai/conversations', { method: 'POST', body: { topic } }),
    onSuccess: (c) => {
      void qc.invalidateQueries({ queryKey: qk.conversations });
      navigate(`/mentor/${c.id}`);
    },
  });
  const remove = useMutation({
    mutationFn: (cid: string) => api(`/ai/conversations/${cid}`, { method: 'DELETE' }),
    onSuccess: (_r, cid) => {
      void qc.invalidateQueries({ queryKey: qk.conversations });
      if (cid === id) navigate('/mentor');
    },
  });

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [convo.data?.messages.length, streaming?.text]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const send = async (content = input) => {
    if (!id || !content.trim() || streaming) return;
    setInput('');
    const key = qk.conversation(id);
    const optimistic: MentorMessageDto = {
      id: `tmp-${Date.now()}`,
      role: 'user',
      content,
      model: null,
      sources: [],
      createdAt: new Date().toISOString(),
    };
    qc.setQueryData<ConversationDto>(key, (old) =>
      old ? { ...old, messages: [...old.messages, optimistic] } : old,
    );
    const abort = new AbortController();
    abortRef.current = abort;
    setStreaming({ text: '', model: '', sources: [] });
    try {
      for await (const ev of streamEvents(
        `/ai/conversations/${id}/messages`,
        { content, useCommunity },
        abort.signal,
      )) {
        if (ev.type === 'start') setStreaming({ text: '', model: ev.model, sources: [] });
        else if (ev.type === 'sources')
          setStreaming((s) => (s ? { ...s, sources: ev.sources } : s));
        else if (ev.type === 'delta')
          setStreaming((s) => (s ? { ...s, text: s.text + ev.text } : s));
        else if (ev.type === 'error') toast.error(ev.message);
      }
    } catch (err) {
      if (!abort.signal.aborted) toast.error(errorMessage(err));
    } finally {
      setStreaming(null);
      abortRef.current = null;
      await qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({ queryKey: qk.conversations });
    }
  };

  const topic = (convo.data?.topic ?? 'general') as MentorTopic;
  const messages = convo.data?.messages ?? [];

  return (
    <div className="mx-auto grid h-[calc(100vh-4rem)] max-w-7xl gap-4 px-3 py-4 sm:px-6 lg:grid-cols-[17rem_1fr]">
      <aside className="hidden min-h-0 flex-col lg:flex" aria-label="Conversations">
        <Button
          onClick={() => create.mutate('general')}
          loading={create.isPending}
          icon={<Plus className="h-4 w-4" />}
          className="w-full"
        >
          New conversation
        </Button>
        <ul className="mt-4 flex-1 space-y-1 overflow-y-auto">
          {conversations.isPending && <Skeleton className="h-10" />}
          {conversations.data?.map((c) => (
            <li key={c.id} className="group flex items-center">
              <Link
                to={`/mentor/${c.id}`}
                className={cn(
                  'min-w-0 flex-1 rounded-lg px-3 py-2 text-sm',
                  c.id === id ? 'bg-accent-soft text-accent' : 'hover:bg-surface-2',
                )}
              >
                <span className="block truncate font-medium">{c.title}</span>
                <span className="text-xs text-muted">
                  {TOPIC_META[c.topic].label} · {timeAgo(c.updatedAt)}
                </span>
              </Link>
              <button
                type="button"
                onClick={() => remove.mutate(c.id)}
                className="rounded p-1.5 text-muted opacity-0 group-hover:opacity-100 hover:text-danger focus:opacity-100"
                aria-label={`Delete ${c.title}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <Card className="flex min-h-0 flex-col overflow-hidden">
        {status?.isDemo && (
          <p className="border-b border-line bg-warning/10 px-4 py-2 text-xs text-warning">
            Demo mode: the server has no Gemini API key, so replies are canned examples.
          </p>
        )}
        {!id ? (
          <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto p-6 text-center">
            <Bot className="h-12 w-12 text-accent" />
            <h1 className="mt-4 text-2xl font-bold">Your AI mentor</h1>
            <p className="mt-2 max-w-lg text-muted">
              Pick a focus. Conversations are saved so you can continue later.
            </p>
            <div className="mt-8 grid w-full max-w-3xl gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {MENTOR_TOPICS.map((t) => {
                const M = TOPIC_META[t];
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => create.mutate(t)}
                    className="rounded-xl border border-line bg-surface p-4 text-left transition-shadow hover:shadow-glow"
                  >
                    <M.icon className="h-5 w-5 text-accent" />
                    <p className="mt-2 font-semibold">{M.label}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-muted">{M.prompt}</p>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 border-b border-line px-4 py-3">
              <h1 className="truncate font-semibold">{convo.data?.title ?? 'Conversation'}</h1>
              <span className="rounded-md bg-surface-2 px-2 py-0.5 text-xs text-muted">
                {TOPIC_META[topic].label}
              </span>
            </div>
            <div className="flex-1 space-y-6 overflow-y-auto p-4 sm:p-6" aria-live="polite">
              {convo.isPending && <Skeleton className="h-24" />}
              {messages.length === 0 && !convo.isPending && !streaming && (
                <button
                  type="button"
                  onClick={() => void send(TOPIC_META[topic].prompt)}
                  className="w-full rounded-xl border border-dashed border-line p-4 text-left text-sm text-muted hover:border-accent hover:text-fg"
                >
                  Try: “{TOPIC_META[topic].prompt}”
                </button>
              )}
              {messages.map((m) => (
                <Message
                  key={m.id}
                  role={m.role}
                  content={m.content}
                  sources={m.sources}
                  name={user?.displayName ?? user?.username ?? 'You'}
                />
              ))}
              {streaming && (
                <Message
                  role="assistant"
                  content={streaming.text || '…'}
                  sources={streaming.sources}
                  name="Mentor"
                  streaming
                />
              )}
              <div ref={bottom} />
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
              className="border-t border-line p-3"
            >
              <div className="flex items-end gap-2">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  rows={2}
                  maxLength={8000}
                  placeholder="Ask anything. Paste code in ``` fences. Enter to send, Shift+Enter for a new line."
                  aria-label="Message the mentor"
                  className="min-h-0 resize-none"
                />
                {streaming ? (
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={() => abortRef.current?.abort()}
                    aria-label="Stop generating"
                  >
                    <Square className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button type="submit" size="icon" disabled={!input.trim()} aria-label="Send">
                    <Send className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <label className="mt-2 flex w-fit cursor-pointer items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={useCommunity}
                  onChange={(e) => setUseCommunity(e.target.checked)}
                  className="accent-[var(--color-accent)]"
                />
                <BookOpen className="h-3.5 w-3.5" aria-hidden />
                Ground answers in DevHub+ community posts (with citations)
              </label>
            </form>
          </>
        )}
      </Card>
    </div>
  );
}

/** Numbered community sources behind a grounded reply; the text cites them as [n]. */
function Sources({ sources }: { sources: CitationDto[] }) {
  if (!sources.length) return null;
  return (
    <details className="mt-3 border-t border-line pt-2 text-xs">
      <summary className="cursor-pointer text-muted select-none hover:text-fg">
        <BookOpen className="mr-1 inline h-3.5 w-3.5" aria-hidden />
        {sources.length} community {sources.length === 1 ? 'source' : 'sources'}
      </summary>
      <ol className="mt-2 space-y-2">
        {sources.map((src) => (
          <li key={src.n} className="flex gap-2">
            <span className="font-mono text-accent">[{src.n}]</span>
            <div className="min-w-0">
              <Link
                to={`/questions/${src.questionId}${src.answerId ? `#answer-${src.answerId}` : ''}`}
                className="font-medium hover:text-accent hover:underline"
              >
                {src.questionTitle}
              </Link>
              {src.accepted && (
                <span className="ml-1.5 inline-flex items-center gap-0.5 text-success">
                  <CheckCircle2 className="h-3 w-3" aria-hidden /> accepted answer
                </span>
              )}
              <p className="line-clamp-2 text-muted">{src.excerpt}</p>
            </div>
          </li>
        ))}
      </ol>
    </details>
  );
}

function Message({
  role,
  content,
  name,
  streaming,
  sources = [],
}: {
  role: 'user' | 'assistant';
  content: string;
  name: string;
  streaming?: boolean;
  sources?: CitationDto[];
}) {
  return (
    <div className={cn('flex gap-3', role === 'user' && 'flex-row-reverse')}>
      {role === 'assistant' ? (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
          <Bot className="h-4 w-4" />
        </span>
      ) : (
        <Avatar name={name} size={32} />
      )}
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-4 py-3',
          role === 'user' ? 'bg-accent text-accent-fg' : 'bg-surface-2',
        )}
      >
        {role === 'user' ? (
          <p className="text-sm whitespace-pre-wrap">{content}</p>
        ) : (
          <Markdown className="prose-sm">{content}</Markdown>
        )}
        {streaming && (
          <span
            className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-accent align-middle"
            aria-hidden
          />
        )}
        {role === 'assistant' && <Sources sources={sources} />}
      </div>
    </div>
  );
}
