import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileCode2, Folder, FolderOpen, ChevronRight, Search, Sparkles, X } from 'lucide-react';
import { api, repositoryPath } from '../api';
import { Loading, ErrorState, EmptyState } from '../../components/ui';
import type { SourceFile, Repository } from './types';
import AskRepository, { type CodeSelection } from './AskRepository';
type TreeNode = { name: string; path: string; children: Map<string, TreeNode>; file: boolean };
export default function CodeBrowser({
  repo,
  revision,
  path,
  line,
  select,
}: {
  repo: Repository;
  revision: string;
  path: string;
  line: number;
  select: (path: string, line?: number) => void;
}) {
  const [search, setSearch] = useState(''),
    [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [range, setRange] = useState<{ startLine: number; endLine: number } | null>(null);
  const [context, setContext] = useState<CodeSelection | undefined>(),
    [assistant, setAssistant] = useState(false);
  const source = useRef<HTMLDivElement>(null);
  const assistantPanel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (assistant) {
      assistantPanel.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      assistantPanel.current?.querySelector('textarea')?.focus({ preventScroll: true });
    }
  }, [assistant, context]);
  const selected =
    path || repo.files.find((f) => /(^|\/)readme\.md$/i.test(f.path))?.path || repo.files[0]?.path || '';
  const file = useQuery({
    queryKey: ['source', repo.id, revision, selected],
    queryFn: () =>
      api<{ data: SourceFile }>(
        `${repositoryPath(repo.id)}/file?revision=${encodeURIComponent(revision)}&path=${encodeURIComponent(selected)}`,
      ),
    enabled: !!selected,
  });
  useEffect(() => {
    setRange(null);
    setContext(undefined);
    const segments = selected.split('/');
    setExpanded(
      (current) =>
        new Set([...current, ...segments.slice(0, -1).map((_, i) => segments.slice(0, i + 1).join('/'))]),
    );
  }, [selected, revision]);
  useEffect(() => {
    if (line && file.data)
      source.current?.querySelector(`[data-line="${line}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [line, file.data]);
  const tree = useMemo(() => {
    const root = new Map<string, TreeNode>();
    for (const f of repo.files.filter((f) => f.path.toLowerCase().includes(search.toLowerCase()))) {
      let children = root;
      const parts = f.path.split('/');
      parts.forEach((name, i) => {
        if (!children.has(name))
          children.set(name, {
            name,
            path: parts.slice(0, i + 1).join('/'),
            children: new Map(),
            file: i === parts.length - 1,
          });
        children = children.get(name)!.children;
      });
    }
    return root;
  }, [repo.files, search]);
  const renderTree = (nodes: Map<string, TreeNode>, depth = 0): React.ReactNode =>
    [...nodes.values()]
      .sort((a, b) => Number(a.file) - Number(b.file) || a.name.localeCompare(b.name))
      .map((node) => {
        const open = !!search || expanded.has(node.path);
        return (
          <div key={node.path} role="none">
            <button
              className={`tree-item ${selected === node.path ? 'active' : ''}`}
              role="treeitem"
              aria-selected={node.file ? selected === node.path : undefined}
              aria-expanded={!node.file ? open : undefined}
              style={{ paddingLeft: 12 + depth * 16 }}
              title={node.path}
              onClick={() => {
                if (node.file) select(node.path);
                else
                  setExpanded((current) => {
                    const next = new Set(current);
                    if (next.has(node.path)) next.delete(node.path);
                    else next.add(node.path);
                    return next;
                  });
              }}
            >
              {node.file ? (
                <FileCode2 size={15} />
              ) : (
                <>
                  <ChevronRight size={12} className={open ? 'tree-chevron open' : 'tree-chevron'} />
                  {open ? <FolderOpen size={15} /> : <Folder size={15} />}
                </>
              )}
              <span>{node.name}</span>
            </button>
            {!node.file && open && <div role="group">{renderTree(node.children, depth + 1)}</div>}
          </div>
        );
      });
  const ask = (wholeFile = false) => {
    setContext({ path: selected, ...(!wholeFile && range ? range : {}) });
    setAssistant(true);
  };
  const captureSelection = () => {
    const selection = window.getSelection();
    if (
      !selection ||
      selection.isCollapsed ||
      !source.current?.contains(selection.anchorNode) ||
      !source.current.contains(selection.focusNode)
    )
      return;
    const lineOf = (node: Node | null) =>
      Number(
        (node?.nodeType === Node.ELEMENT_NODE ? (node as Element) : node?.parentElement)
          ?.closest('[data-line]')
          ?.getAttribute('data-line'),
      );
    const start = lineOf(selection.anchorNode),
      end = lineOf(selection.focusNode);
    if (start && end) setRange({ startLine: Math.min(start, end), endLine: Math.max(start, end) });
  };
  if (!repo.files.length)
    return (
      <EmptyState
        title="Your code will appear here after indexing"
        description="Choose a branch and select Index latest code above. Then open a file and ask CodeLens about it."
      />
    );
  return (
    <div className={`code-workbench ${assistant ? 'with-assistant' : ''}`}>
      <div className="code-layout">
        <aside className="file-sidebar">
          <div className="tree-heading">
            <strong>Files</strong>
            <span>{repo.files.length} indexed</span>
          </div>
          <label className="search-field">
            <Search size={14} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Find a file…"
              aria-label="Find a file"
            />
          </label>
          <div role="tree" aria-label="Repository file tree">
            {renderTree(tree)}
          </div>
          {!tree.size && <p className="subtle-text p-4">No matching files.</p>}
          <p className="tree-footnote">GitHub folder paths, limited to files included in this index.</p>
        </aside>
        <section className="source-pane">
          <header className="source-header">
            <strong title={selected}>{selected}</strong>
            <span>{revision.slice(0, 10)}</span>
          </header>
          <div className="source-actions">
            <button className="btn-secondary" disabled={!file.data} onClick={() => ask(true)}>
              <Sparkles size={14} /> Ask about this file
            </button>
            {range && (
              <button className="btn-primary" onClick={() => ask()}>
                <Sparkles size={14} /> Ask about lines {range.startLine}–{range.endLine}
              </button>
            )}
          </div>
          <p className="source-hint">
            Select text, click a line number, or Shift-click another line to select a range.
          </p>
          {file.isLoading ? (
            <Loading label="Opening indexed source…" />
          ) : file.isError ? (
            <ErrorState error={file.error} retry={() => file.refetch()} />
          ) : (
            <div
              ref={source}
              className="source-lines"
              onMouseUp={captureSelection}
              onKeyUp={captureSelection}
            >
              {file.data?.data.content?.split('\n').map((text, i) => (
                <div
                  key={i}
                  data-line={i + 1}
                  className={`source-line ${(range ? i + 1 >= range.startLine && i + 1 <= range.endLine : line === i + 1) ? 'highlight' : ''}`}
                >
                  <button
                    className="line-number"
                    aria-label={`Select line ${i + 1}`}
                    onClick={(e) =>
                      setRange(
                        e.shiftKey && range
                          ? {
                              startLine: Math.min(range.startLine, i + 1),
                              endLine: Math.max(range.startLine, i + 1),
                            }
                          : { startLine: i + 1, endLine: i + 1 },
                      )
                    }
                  >
                    {i + 1}
                  </button>
                  <code>{text || ' '}</code>
                </div>
              ))}
            </div>
          )}
          {!!file.data?.data.symbols.length && (
            <details className="source-symbols">
              <summary>Jump to a function or symbol ({file.data.data.symbols.length})</summary>
              {file.data.data.symbols.map((s, i) => (
                <button
                  className="file-item"
                  key={i}
                  onClick={() => {
                    select(selected, s.line);
                    setRange({ startLine: s.line, endLine: s.line });
                  }}
                >
                  {s.name} · line {s.line}
                </button>
              ))}
            </details>
          )}
        </section>
      </div>
      {assistant && (
        <aside className="code-assistant" ref={assistantPanel}>
          <button
            className="icon-button close-assistant"
            aria-label="Close AI panel"
            onClick={() => setAssistant(false)}
          >
            <X size={16} />
          </button>
          <AskRepository
            key={`${repo.id}-${revision}`}
            id={repo.id}
            revision={revision}
            selection={context}
            compact
            clearSelection={() => setContext(undefined)}
          />
        </aside>
      )}
    </div>
  );
}
