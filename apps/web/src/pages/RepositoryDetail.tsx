import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  FileCode2,
  FolderOpen,
  GitBranch,
  Network,
  Pencil,
  Play,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  analyzeRepository,
  chatWithRepo,
  deleteRepository,
  fetchRepositoryDetail,
  fetchRepositoryFile,
  fetchRepositoryPipeline,
  syncRepository,
  triagePipelineLog,
  updateRepository,
} from '../api';

type Node = { name: string; path: string; file?: any; children: Map<string, Node> };
function makeTree(files: any[]) {
  const root: Node = { name: '', path: '', children: new Map() };
  for (const file of files) {
    let parent = root;
    const parts = file.path.split('/');
    parts.forEach((name: string, index: number) => {
      const nodePath = parts.slice(0, index + 1).join('/');
      if (!parent.children.has(name))
        parent.children.set(name, { name, path: nodePath, children: new Map() });
      parent = parent.children.get(name)!;
      if (index === parts.length - 1) parent.file = file;
    });
  }
  return root;
}
function Tree({
  node,
  selected,
  select,
  depth = 0,
}: {
  node: Node;
  selected: string | null;
  select(path: string): void;
  depth?: number;
}) {
  return (
    <>
      {[...node.children.values()]
        .sort((a, b) => Number(Boolean(a.file)) - Number(Boolean(b.file)) || a.name.localeCompare(b.name))
        .map((child) =>
          child.file ? (
            <button
              key={child.path}
              onClick={() => select(child.path)}
              style={{ paddingLeft: depth * 14 + 8 }}
              className={
                'w-full flex items-center gap-2 py-1 pr-2 rounded text-left text-xs font-mono ' +
                (selected === child.path
                  ? 'bg-accent/15 text-accent-text'
                  : 'text-text-secondary hover:bg-surface-3')
              }
            >
              <FileCode2 className="w-3.5 h-3.5 shrink-0" />
              {child.name}
            </button>
          ) : (
            <details key={child.path} open>
              <summary
                style={{ paddingLeft: depth * 14 + 8 }}
                className="flex cursor-pointer list-none items-center gap-2 py-1 pr-2 text-xs text-text-secondary hover:text-text-primary"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                {child.name}
              </summary>
              <Tree node={child} selected={selected} select={select} depth={depth + 1} />
            </details>
          ),
        )}
    </>
  );
}
function Graph({
  files,
  edges,
  selected,
  select,
}: {
  files: any[];
  edges: any[];
  selected: string | null;
  select(path: string): void;
}) {
  const nodes = files
    .slice(0, 24)
    .map((file: any, i: number) => ({ ...file, x: 40 + (i % 4) * 215, y: 40 + Math.floor(i / 4) * 82 }));
  const byPath = new Map(nodes.map((node: any) => [node.path, node]));
  return (
    <div className="overflow-auto rounded-lg border border-border bg-surface-3">
      <svg viewBox="0 0 900 560" className="min-w-[900px] min-h-[560px]">
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#52647a" />
          </marker>
        </defs>
        {edges
          .filter((edge: any) => byPath.has(edge.sourcePath) && byPath.has(edge.targetPath))
          .map((edge: any) => {
            const source: any = byPath.get(edge.sourcePath);
            const target: any = byPath.get(edge.targetPath);
            return (
              <line
                key={edge.id}
                x1={source.x + 150}
                y1={source.y + 18}
                x2={target.x}
                y2={target.y + 18}
                stroke="#52647a"
                markerEnd="url(#arrow)"
              />
            );
          })}
        {nodes.map((node: any) => (
          <g key={node.path} className="cursor-pointer" onClick={() => select(node.path)}>
            <rect
              x={node.x}
              y={node.y}
              width="150"
              height="36"
              rx="6"
              fill={selected === node.path ? '#123a4a' : '#17212f'}
              stroke={selected === node.path ? '#22b8cf' : '#334155'}
            />
            <text x={node.x + 8} y={node.y + 22} fill="#d9e2ec" fontSize="10">
              {node.path.split('/').slice(-2).join('/')}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export default function RepositoryDetail() {
  const { id } = useParams();
  const client = useQueryClient();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'explorer' | 'graph' | 'findings' | 'pipeline'>('explorer');
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedLine, setSelectedLine] = useState<number | null>(null);
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<{ role: string; text: string; sources?: any[] }[]>([]);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; line: number } | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftDescription, setDraftDescription] = useState('');
  const [draftBranch, setDraftBranch] = useState('');
  const [pipelineLog, setPipelineLog] = useState('');
  const repository = useQuery({
    queryKey: ['repository', id],
    queryFn: () => fetchRepositoryDetail(id!),
    refetchInterval: 2500,
  });
  const file = useQuery({
    queryKey: ['repository-file', id, selectedPath],
    queryFn: () => fetchRepositoryFile(id!, selectedPath!),
    enabled: Boolean(id && selectedPath),
  });
  const pipeline = useQuery({
    queryKey: ['repository-pipeline', id],
    queryFn: () => fetchRepositoryPipeline(id!),
    enabled: Boolean(id),
    refetchInterval: 5000,
  });
  const analysis = useMutation({
    mutationFn: (id: string) => analyzeRepository(id),
    onSuccess: () => client.invalidateQueries({ queryKey: ['repository', id] }),
  });
  const sync = useMutation({
    mutationFn: syncRepository,
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['repository', id] });
      client.invalidateQueries({ queryKey: ['repositories'] });
    },
  });
  const remove = useMutation({
    mutationFn: deleteRepository,
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['repositories'] });
      navigate('/repositories');
    },
  });
  const update = useMutation({
    mutationFn: (updates: { description?: string; defaultBranch?: string }) =>
      updateRepository(repo?.id ?? id!, updates),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['repository', id] });
      client.invalidateQueries({ queryKey: ['repositories'] });
      setEditing(false);
    },
  });
  const triage = useMutation({ mutationFn: (log: string) => triagePipelineLog(id!, log) });
  const chat = useMutation({
    mutationFn: (message: string) => chatWithRepo(id!, message, selectedPath ?? undefined),
    onSuccess: (result, message) =>
      setMessages((items) => [
        ...items,
        { role: 'user', text: message },
        { role: 'assistant', text: result.data.message, sources: result.data.sources },
      ]),
  });
  if (repository.isLoading)
    return <div className="py-12 text-center text-text-muted">Loading repository intelligence…</div>;
  const repo = repository.data?.data;
  if (!repo) return <div className="py-12 text-center text-text-muted">Repository not found.</div>;
  const files = repo.files ?? [];
  const edges = repo.dependencyGraph ?? [];
  const findings = repo.findings ?? [];
  const latest = repo.analysisRuns?.[0];
  const current = file.data?.data;
  const root = makeTree(files);
  const select = (path: string, line?: number) => {
    setSelectedPath(path);
    setSelectedLine(line ?? null);
    setTab('explorer');
  };
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    let text = question.trim();
    if (selectedLine && selectedPath)
      text =
        'Explain line ' +
        selectedLine +
        ' in ' +
        selectedPath +
        ': ' +
        (text || 'Explain its purpose, dependencies, and risks.');
    if (text && !chat.isPending) {
      setQuestion('');
      chat.mutate(text);
    }
  };
  const stages = [
    ['Clone & discover', latest?.status !== 'pending'],
    ['Static checks', (latest?.filesProcessed ?? 0) > 0],
    ['Dependency extraction', edges.length > 0],
    ['Knowledge index', files.length > 0],
    ['Evidence report', latest?.status === 'completed'],
  ];
  return (
    <div className="space-y-5 animate-fade-in" onClick={() => setContextMenu(null)}>
      <div className="flex items-start gap-3">
        <Link to="/repositories" className="mt-1 p-1.5 rounded hover:bg-surface-3">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-text-primary">{repo.fullName}</h1>
            <span className="badge text-2xs bg-surface-3 border border-border">
              {repo.language ?? 'Mixed'}
            </span>
          </div>
          <p className="mt-1 text-xs text-text-secondary">
            {latest?.status === 'completed'
              ? 'Indexed ' + new Date(latest.completedAt).toLocaleString()
              : (latest?.error ?? 'Run analysis to construct repository intelligence.')}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            className="btn-secondary text-xs"
            onClick={(event) => {
              event.stopPropagation();
              setDraftDescription(repo.description ?? '');
              setDraftBranch(repo.defaultBranch ?? 'main');
              setEditing(true);
            }}
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit
          </button>
          <button
            className="btn-secondary text-xs"
            onClick={(event) => {
              event.stopPropagation();
              sync.mutate(repo.id);
            }}
            disabled={sync.isPending}
          >
            <RefreshCw className={'w-3.5 h-3.5 ' + (sync.isPending ? 'animate-spin' : '')} />
            {sync.isPending ? 'Syncing' : 'Sync GitHub'}
          </button>
          <button
            className="btn-primary text-xs"
            onClick={(event) => {
              event.stopPropagation();
              analysis.mutate(repo.id);
            }}
            disabled={analysis.isPending || ['pending', 'processing'].includes(latest?.status)}
          >
            <Play className="w-3.5 h-3.5" />
            {analysis.isPending || ['pending', 'processing'].includes(latest?.status)
              ? 'Analyzing ' + Math.round(latest?.progress ?? 0) + '%'
              : 'Run analysis'}
          </button>
          <button
            aria-label="Remove repository"
            title="Remove repository"
            className="btn-secondary px-2 text-xs text-status-critical"
            onClick={(event) => {
              event.stopPropagation();
              if (window.confirm('Remove this repository and all indexed data?')) remove.mutate(repo.id);
            }}
            disabled={remove.isPending}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      {(sync.isError || analysis.isError || remove.isError) && (
        <p className="rounded border border-status-critical/30 bg-status-critical/10 px-3 py-2 text-xs text-status-critical">
          {String(
            (sync.error ?? analysis.error ?? remove.error) instanceof Error
              ? (sync.error ?? analysis.error ?? (remove.error as Error)).message
              : 'Repository action failed. Please try again.',
          )}
        </p>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          ['Risk score', Math.round(repo.riskScore ?? 0) + '%'],
          ['Indexed files', files.length],
          ['Dependency edges', edges.length],
          ['Static findings', findings.length],
        ].map(([label, value]) => (
          <div key={String(label)} className="card">
            <span className="metric-label">{label}</span>
            <div className="metric-value mt-1">{value}</div>
          </div>
        ))}
      </div>
      <div className="flex gap-1 border-b border-border">
        {(
          [
            { key: 'explorer', text: 'Code explorer', icon: FolderOpen },
            { key: 'graph', text: 'Dependency graph', icon: Network },
            { key: 'findings', text: 'Findings', icon: AlertTriangle },
            { key: 'pipeline', text: 'Pipeline', icon: GitBranch },
          ] as const
        ).map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            className={
              'flex items-center gap-2 px-3 py-2 text-xs border-b-2 ' +
              (tab === item.key
                ? 'border-accent text-accent-text'
                : 'border-transparent text-text-muted hover:text-text-primary')
            }
          >
            <item.icon className="w-3.5 h-3.5" />
            {item.text}
          </button>
        ))}
      </div>
      {tab === 'explorer' && (
        <div className="grid grid-cols-1 xl:grid-cols-[250px_minmax(0,1fr)_320px] gap-4">
          <section className="card p-2 max-h-[680px] overflow-auto">
            <p className="px-2 py-2 text-2xs uppercase tracking-wider text-text-muted">Repository tree</p>
            {files.length ? (
              <Tree node={root} selected={selectedPath} select={select} />
            ) : (
              <p className="p-3 text-xs text-text-muted">Run analysis to populate the tree.</p>
            )}
          </section>
          <section className="card p-0 overflow-hidden">
            <div className="flex justify-between border-b border-border px-4 py-3">
              <span className="font-mono text-xs text-text-primary">{selectedPath ?? 'Select a file'}</span>
              {current && (
                <span className="text-2xs text-text-muted">
                  {current.language} · complexity {current.complexity}
                </span>
              )}
            </div>
            {file.isLoading ? (
              <p className="p-6 text-xs text-text-muted">Loading source…</p>
            ) : current ? (
              <div className="max-h-[610px] overflow-auto font-mono text-xs">
                {current.content.split(/\r?\n/).map((line: string, index: number) => (
                  <button
                    key={index}
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedLine(index + 1);
                    }}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setSelectedLine(index + 1);
                      setContextMenu({ x: event.clientX, y: event.clientY, line: index + 1 });
                    }}
                    className={
                      'flex w-full text-left hover:bg-surface-3 ' +
                      (selectedLine === index + 1 ? 'bg-accent/10 ring-1 ring-inset ring-accent/30' : '')
                    }
                  >
                    <span className="w-12 shrink-0 border-r border-border px-2 py-0.5 text-right text-text-muted">
                      {index + 1}
                    </span>
                    <code className="whitespace-pre px-3 py-0.5 text-text-secondary">{line || ' '}</code>
                  </button>
                ))}
              </div>
            ) : (
              <p className="p-8 text-center text-sm text-text-muted">
                Choose a file, select a line, then ask for an explanation.
              </p>
            )}
          </section>
          <section className="card flex min-h-[430px] flex-col">
            <div className="flex items-center gap-2 border-b border-border pb-3">
              <Bot className="w-4 h-4 text-accent" />
              <div>
                <h2 className="text-sm font-semibold text-text-primary">Evidence-backed assistant</h2>
                <p className="text-2xs text-text-muted">
                  {selectedLine
                    ? 'Line ' + selectedLine + ' selected'
                    : (selectedPath ?? 'Repository-wide retrieval')}
                </p>
              </div>
            </div>
            {current && (
              <p className="mt-3 rounded bg-surface-3 p-3 text-xs text-text-secondary">{current.summary}</p>
            )}
            <div className="flex-1 space-y-3 overflow-auto py-3">
              {!messages.length && (
                <p className="text-xs text-text-muted">
                  Ask for explanations, dependency impact, refactoring, tests, or risk analysis. Each answer
                  cites retrieved files.
                </p>
              )}
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={
                    'rounded p-2.5 text-xs ' +
                    (message.role === 'user'
                      ? 'bg-accent/15 text-accent-text'
                      : 'bg-surface-3 text-text-secondary')
                  }
                >
                  <p>{message.text}</p>
                  {message.sources?.map((source: any) => (
                    <p key={source.path} className="mt-2 font-mono text-2xs text-text-muted">
                      Evidence: {source.path}
                    </p>
                  ))}
                </div>
              ))}
            </div>
            <form onSubmit={submit} className="flex gap-2">
              <input
                className="input min-w-0 flex-1 text-xs"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder={selectedLine ? 'Ask about selected line' : 'Ask about this repository'}
              />
              <button className="btn-primary px-3 text-xs" disabled={chat.isPending}>
                <Search className="w-3.5 h-3.5" />
              </button>
            </form>
          </section>
        </div>
      )}
      {tab === 'graph' && (
        <section className="card">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-text-primary">Resolved dependency graph</h2>
            <p className="mt-1 text-xs text-text-secondary">
              Nodes and edges are extracted from indexed source imports. Select a node to inspect its source.
            </p>
          </div>
          {files.length ? (
            <Graph files={files} edges={edges} selected={selectedPath} select={select} />
          ) : (
            <p className="text-sm text-text-muted">Run analysis to build graph data.</p>
          )}
        </section>
      )}
      {tab === 'findings' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <section className="card">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-text-primary">
              <Sparkles className="w-4 h-4 text-accent" />
              Architecture evidence
            </h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-text-secondary">
              {repo.description ?? 'No report generated yet.'}
            </p>
          </section>
          <section className="card">
            <h2 className="mb-3 text-sm font-semibold text-text-primary">Static findings</h2>
            <div className="space-y-2 max-h-[430px] overflow-auto">
              {findings.map((finding: any) => (
                <button
                  key={finding.id}
                  onClick={() => select(finding.filePath, finding.line)}
                  className="w-full rounded bg-surface-3 p-3 text-left hover:bg-surface-4"
                >
                  <div className="flex justify-between gap-2">
                    <span className="text-xs font-medium text-text-primary">{finding.title}</span>
                    <span className="text-2xs text-text-muted">{finding.severity}</span>
                  </div>
                  <p className="mt-1 text-xs text-text-secondary">{finding.description}</p>
                  <p className="mt-2 font-mono text-2xs text-accent">
                    Open {finding.filePath}:{finding.line}
                  </p>
                </button>
              ))}
              {!findings.length && <p className="text-sm text-text-muted">No findings yet.</p>}
            </div>
          </section>
        </div>
      )}
      {tab === 'pipeline' && (
        <div className="space-y-4">
          <section className="card">
            <h2 className="text-sm font-semibold text-text-primary">Repository analysis pipeline</h2>
            <p className="mt-1 text-xs text-text-secondary">
              Progress reflects the latest persisted analysis run, not a scripted animation.
            </p>
            <div className="mt-6 grid grid-cols-1 md:grid-cols-5 gap-3">
              {stages.map(([name, complete], index) => (
                <div
                  key={String(name)}
                  className={
                    'rounded-lg border p-4 ' +
                    (complete ? 'border-status-healthy/30 bg-status-healthy/5' : 'border-border bg-surface-3')
                  }
                >
                  <p
                    className={'text-2xs font-mono ' + (complete ? 'text-status-healthy' : 'text-text-muted')}
                  >
                    {complete
                      ? 'COMPLETE'
                      : latest?.status === 'processing' && index === stages.findIndex((stage) => !stage[1])
                        ? 'RUNNING'
                        : 'PENDING'}
                  </p>
                  <p className="mt-2 text-sm font-medium text-text-primary">{name}</p>
                </div>
              ))}
            </div>
            <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <p>
                <span className="block text-text-muted">Status</span>
                <span className="font-mono text-text-primary">{latest?.status ?? 'not started'}</span>
              </p>
              <p>
                <span className="block text-text-muted">Files</span>
                <span className="font-mono text-text-primary">
                  {latest?.filesProcessed ?? 0}/{latest?.totalFiles ?? 0}
                </span>
              </p>
              <p>
                <span className="block text-text-muted">Indexed</span>
                <span className="font-mono text-text-primary">{latest?.symbolsIndexed ?? 0}</span>
              </p>
              <p>
                <span className="block text-text-muted">Findings</span>
                <span className="font-mono text-text-primary">{latest?.findingsCount ?? 0}</span>
              </p>
            </div>
          </section>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <section className="card">
              <h2 className="text-sm font-semibold text-text-primary">GitHub delivery timeline</h2>
              <p className="mt-1 text-xs text-text-secondary">
                Verified webhook deliveries for this repository. Configure push, pull request, and workflow
                run events to keep this live.
              </p>
              <div className="mt-4 max-h-72 space-y-2 overflow-auto">
                {pipeline.data?.data?.webhookEvents?.map((event: any) => (
                  <div key={event.id} className="rounded bg-surface-3 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-text-primary">
                        {event.workflow?.name ?? event.eventType}
                      </span>
                      <span
                        className={
                          'text-2xs ' +
                          (event.workflow?.conclusion === 'failure'
                            ? 'text-status-critical'
                            : 'text-text-muted')
                        }
                      >
                        {event.workflow?.conclusion ?? event.action ?? 'received'}
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-2xs text-text-muted">
                      {(event.workflow?.sha ?? event.sha ?? 'no SHA').slice(0, 12)} ·{' '}
                      {new Date(event.receivedAt).toLocaleString()}
                    </p>
                    {event.pullRequest && (
                      <p className="mt-1 text-xs text-text-secondary">
                        PR #{event.pullRequest.number}: {event.pullRequest.title}
                      </p>
                    )}
                  </div>
                ))}
                {!pipeline.data?.data?.webhookEvents?.length && (
                  <p className="py-6 text-center text-xs text-text-muted">
                    No verified deliveries yet. Sync manually, or configure the webhook shown in
                    Documentation.
                  </p>
                )}
              </div>
            </section>
            <section className="card">
              <h2 className="text-sm font-semibold text-text-primary">CI failure triage</h2>
              <p className="mt-1 text-xs text-text-secondary">
                Paste a failed job log. CodeLens isolates the first meaningful failure, classifies it, and
                suggests the next safe investigation step.
              </p>
              <textarea
                className="input mt-4 min-h-36 w-full font-mono text-xs"
                value={pipelineLog}
                onChange={(event) => setPipelineLog(event.target.value)}
                placeholder="Paste a CI job log, stack trace, or test output…"
              />
              <button
                className="btn-primary mt-3 text-xs"
                disabled={triage.isPending || !pipelineLog.trim()}
                onClick={() => triage.mutate(pipelineLog)}
              >
                {triage.isPending ? 'Triaging' : 'Triage failure log'}
              </button>
              {triage.data?.data && (
                <div className="mt-4 rounded border border-border bg-surface-3 p-3">
                  <div className="flex justify-between gap-2">
                    <span className="text-xs font-medium text-text-primary">
                      {triage.data.data.classification.replaceAll('_', ' ')}
                    </span>
                    <span className="text-2xs text-accent">
                      {Math.round(triage.data.data.confidence * 100)}% confidence
                    </span>
                  </div>
                  <p className="mt-2 font-mono text-xs text-status-critical">
                    L{triage.data.data.firstMeaningfulError?.line ?? '—'}:{' '}
                    {triage.data.data.firstMeaningfulError?.text ?? 'No meaningful error found'}
                  </p>
                  <p className="mt-3 text-xs leading-5 text-text-secondary">
                    {triage.data.data.recommendation}
                  </p>
                </div>
              )}
              {triage.isError && (
                <p className="mt-3 text-xs text-status-critical">{(triage.error as Error).message}</p>
              )}
            </section>
          </div>
        </div>
      )}
      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setEditing(false)}
        >
          <form
            className="card w-full max-w-lg"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              update.mutate({ description: draftDescription, defaultBranch: draftBranch });
            }}
          >
            <h2 className="text-base font-semibold text-text-primary">Repository settings</h2>
            <p className="mt-1 text-xs text-text-muted">
              Update local metadata. Sync GitHub restores remote metadata on the next refresh.
            </p>
            <label className="mt-4 block text-xs text-text-secondary">
              Default branch
              <input
                className="input mt-1 w-full text-sm"
                value={draftBranch}
                onChange={(event) => setDraftBranch(event.target.value)}
                required
              />
            </label>
            <label className="mt-3 block text-xs text-text-secondary">
              Workspace notes
              <textarea
                className="input mt-1 min-h-24 w-full text-sm"
                value={draftDescription}
                onChange={(event) => setDraftDescription(event.target.value)}
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="btn-secondary text-xs" onClick={() => setEditing(false)}>
                Cancel
              </button>
              <button className="btn-primary text-xs" disabled={update.isPending}>
                {update.isPending ? 'Saving' : 'Save changes'}
              </button>
            </div>
          </form>
        </div>
      )}
      {contextMenu && (
        <div
          className="fixed z-50 w-52 rounded-lg border border-border bg-surface-1 p-1 shadow-2xl"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <p className="px-2 py-1.5 text-2xs text-text-muted">Line {contextMenu.line}</p>
          <button
            className="w-full rounded px-2 py-2 text-left text-xs hover:bg-surface-3"
            onClick={() => {
              setQuestion('Explain the selected line, its dependencies, and any risk.');
              setContextMenu(null);
            }}
          >
            Ask CodeLens
          </button>
          <button
            className="w-full rounded px-2 py-2 text-left text-xs hover:bg-surface-3"
            onClick={() => {
              setSelectedLine(contextMenu.line);
              setContextMenu(null);
            }}
          >
            Highlight line
          </button>
          <button
            className="w-full rounded px-2 py-2 text-left text-xs hover:bg-surface-3"
            onClick={() => {
              setQuestion('What is the downstream impact if this selected line changes?');
              setContextMenu(null);
            }}
          >
            Trace impact
          </button>
        </div>
      )}
    </div>
  );
}
