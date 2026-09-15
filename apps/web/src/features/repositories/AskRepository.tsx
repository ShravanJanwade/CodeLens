import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Sparkles, ArrowUp, FileCode2, X } from 'lucide-react';
import { api, repositoryPath } from '../api';
import type { Citation } from './types';
import { ErrorState } from '../../components/ui';
import AnswerContent from '../../components/AnswerContent';
export type CodeSelection = { path: string; startLine?: number; endLine?: number };
type ChatMessage = {
  role: string;
  text: string;
  sources?: Citation[];
  fallbackReason?: string;
  provider?: string;
  scope?: string;
};
export default function AskRepository({
  id,
  revision,
  selection,
  clearSelection,
  compact = false,
}: {
  id: string;
  revision: string;
  selection?: CodeSelection;
  clearSelection?: () => void;
  compact?: boolean;
}) {
  const [question, setQuestion] = useState('');
  const client = useQueryClient();
  const [messages, setMessages] = useState<ChatMessage[]>(
    () => client.getQueryData(['conversation', id, revision, compact]) ?? [],
  );
  useEffect(() => {
    client.setQueryData(['conversation', id, revision, compact], messages);
  }, [client, id, revision, compact, messages]);
  const config = useQuery({ queryKey: ['ai-config'], queryFn: () => api('/config') });
  const provider = config.data?.provider;
  const providerLabel =
    provider === 'gemini'
      ? 'Gemini'
      : provider === 'ollama'
        ? 'Ollama · local'
        : provider === 'demo'
          ? 'Source retrieval · no AI'
          : 'Checking AI connection…';
  const scope = selection
    ? selection.path +
      (selection.startLine
        ? ` · lines ${selection.startLine}–${selection.endLine ?? selection.startLine}`
        : ' · entire file')
    : 'Repository context';
  const chat = useMutation({
    mutationFn: (input: {
      message: string;
      selection?: CodeSelection;
      history: Array<{ role: string; text: string }>;
    }) => api(`${repositoryPath(id)}/chat`, { method: 'POST', body: JSON.stringify({ ...input, revision }) }),
    onSuccess: (r) =>
      setMessages((m) => [
        ...m,
        {
          role: 'CodeLens',
          text: r.data.message,
          sources: r.data.sources,
          fallbackReason: r.data.fallbackReason,
          provider: r.data.provider,
        },
      ]),
  });
  const ask = (message: string) => {
    if (!message.trim() || chat.isPending) return;
    setMessages((m) => [...m, { role: 'You', text: message.trim(), scope }]);
    setQuestion('');
    chat.mutate({
      message: message.trim(),
      selection,
      history: messages.slice(-6).map((m) => ({ role: m.role, text: m.text })),
    });
  };
  return (
    <section className={`ask-workbench ${compact ? 'compact' : ''}`} aria-label="CodeLens AI assistant">
      <header className="assistant-heading">
        <div>
          <Sparkles size={20} />
          <strong>Ask CodeLens</strong>
        </div>
        <span className="provider-pill">{providerLabel}</span>
      </header>
      {config.data?.model && <p className="subtle-text ai-model">Model: {config.data.model}</p>}
      {!!messages.length && (
        <button
          className="text-link"
          disabled={chat.isPending}
          onClick={() => {
            setMessages([]);
            chat.reset();
          }}
        >
          New conversation
        </button>
      )}
      {config.isError && <ErrorState error={config.error} retry={() => config.refetch()} />}
      <div className="context-chip">
        <FileCode2 size={15} />
        <span title={scope}>
          {scope}
          <small>Indexed commit {revision.slice(0, 10)}</small>
        </span>
        {selection && clearSelection && (
          <button className="icon-button" aria-label="Clear code context" onClick={clearSelection}>
            <X size={14} />
          </button>
        )}
      </div>
      {!messages.length && (
        <div className="assistant-welcome">
          <h2>{selection ? 'Understand this code.' : 'Start with a question.'}</h2>
          <p className="subtle-text">
            {selection
              ? 'Your question will include the selected code from this exact revision.'
              : 'Find where something happens, understand how it works, or decide what to review. Open Code to ask about a specific file or line.'}
          </p>
          <div className="question-suggestions">
            {(selection
              ? [
                  'Explain this code in plain language.',
                  'What should I check before changing this code?',
                  'Suggest tests for this code.',
                ]
              : [
                  'Give me a short map of this repository and where to start.',
                  'Where does this application start?',
                  'Which files handle data storage?',
                ]
            ).map((q) => (
              <button key={q} onClick={() => ask(q)}>
                {q}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="conversation" aria-live="polite">
        {messages.map((m, i) => (
          <article key={i} className={`message ${m.role === 'You' ? 'user' : ''}`}>
            <small>
              {m.role === 'You'
                ? 'YOU'
                : `CODELENS · ${m.fallbackReason ? 'SOURCE FALLBACK' : (m.provider ?? providerLabel).toUpperCase()}`}
            </small>
            {m.scope && <span className="message-scope">{m.scope}</span>}
            {m.fallbackReason && <div className="notice warning">{m.fallbackReason}</div>}
            <AnswerContent text={m.text} />
            {!!m.sources?.length && (
              <div className="citation-list" aria-label="Answer sources">
                {m.sources.map((s) => (
                  <Link
                    key={`${s.path}:${s.startLine}`}
                    to={`/repositories/${id}?tab=code&revision=${s.revision}&path=${encodeURIComponent(s.path)}&line=${s.startLine}`}
                  >
                    {s.path}:{s.startLine}–{s.endLine}
                  </Link>
                ))}
              </div>
            )}
          </article>
        ))}
        {chat.isPending && (
          <p className="assistant-pending" role="status">
            <Sparkles size={16} /> {providerLabel} is reading your indexed code…
          </p>
        )}
      </div>
      {chat.isError && (
        <ErrorState error={chat.error} retry={() => chat.variables && chat.mutate(chat.variables)} />
      )}
      <form
        className="ask-form"
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
      >
        <textarea
          className="input"
          value={question}
          maxLength={500}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={selection ? 'Ask about the selected code…' : 'What would you like to understand?'}
          aria-label="Repository question"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              ask(question);
            }
          }}
        />
        <button
          className="btn-primary"
          disabled={chat.isPending || !question.trim()}
          aria-label="Send question"
        >
          <ArrowUp size={18} />
        </button>
      </form>
      <p className="assistant-footnote">
        Enter to send · Shift + Enter for a new line. Check the linked source before applying advice.
      </p>
    </section>
  );
}
